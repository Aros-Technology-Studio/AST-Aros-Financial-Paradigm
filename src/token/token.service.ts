import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { BridgeService } from '../bridge/bridge.service';
import { SmartContractIntegration } from '../integration/smart_contract.integration';
import { EmissionService } from './emission.service';
import { ProcessReserveLedgerService } from '../proof_of_transaction_engine/process_reserve.service';
import { EmissionResult } from './emission.interfaces';

@Injectable()
export class TokenService {
    private readonly logger = new Logger(TokenService.name);
    private readonly MINT_ADDRESS = 'SYSTEM_MINT_AUTHORITY_000000000000000000';
    private readonly BURN_ADDRESS = 'SYSTEM_BURN_VAULT_00000000000000000000';

    constructor(
        @InjectRepository(SupplySnapshot)
        private readonly supplyRepository: Repository<SupplySnapshot>,
        private readonly ledgerService: LedgerService,
        private readonly dataSource: DataSource,
        @Inject(forwardRef(() => BridgeService))
        private readonly bridgeService: BridgeService,
        private readonly smartContractService: SmartContractIntegration,
        private readonly eventEmitter: EventEmitter2,
        private readonly emissionService: EmissionService,
        private readonly processReserve: ProcessReserveLedgerService,
    ) { }

    /**
     * Canonical 1:1 emission entry point.
     * Call this whenever a transaction is processed — not the legacy mint().
     *
     * Flow:
     *   Emit = txAmount (1:1)
     *   Fee  = txAmount × rate → 75% nodes + 25% AFC reserve
     *   Burn the emitted ARO after completion
     *   AFC reserve grows → emission price rises
     */
    async mintForTransaction(
        transactionAmount: number,
        recipient: string,
        referenceId: string,
        commissionRate?: number,
    ): Promise<EmissionResult> {
        if (transactionAmount <= 0) {
            throw new BadRequestException('Transaction amount must be positive');
        }

        this.logger.log(
            `[Canonical Emission] TX=${referenceId} amount=${transactionAmount} recipient=${recipient}`,
        );

        const result = await this.emissionService.processTransactionEmission(
            transactionAmount,
            recipient,
            referenceId,
            commissionRate,
        );

        this.eventEmitter.emit('token.emission.canonical', {
            referenceId,
            transactionAmount,
            emissionAmount:  result.emissionAmount,
            commission:      result.commission,
            nodeShare:       result.nodeShare,
            afcReserveShare: result.afcReserveShare,
            emissionPrice:   this.emissionService.getCurrentEmissionPrice(),
        });

        return result;
    }

    async mint(amount: string, recipient: string, referenceId: string): Promise<any> {
        if (parseFloat(amount) <= 0) throw new BadRequestException('Amount must be positive');

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const txAmount = parseFloat(amount);
            const fee = this.emissionService.calculate(txAmount);

            this.logger.log(
                `[Bridge MINT] TX=${referenceId} amount=${amount} → ` +
                `commission=${fee.commission.toFixed(8)} (nodes=${fee.nodeShare.toFixed(8)} AFC=${fee.afcReserveShare.toFixed(8)})`,
            );

            // Step 1 — Mint 1:1 to recipient
            const tx = await this.ledgerService.recordTransaction({
                type: TransactionType.MINT,
                sender: this.MINT_ADDRESS,
                recipient: recipient,
                amount: amount,
                fee: '0',
                nonce: Date.now(),
                metadata: { referenceId, operation: 'FIAT_DEPOSIT' },
            });

            // Step 2 — Commission split: 75% → node pool, 25% → AFC reserve
            await this.ledgerService.recordTransaction({
                type: TransactionType.FEE_DISTRIBUTION,
                sender: recipient,
                recipient: 'SYSTEM_NODE_POOL_00000000000000000000',
                amount: fee.nodeShare.toFixed(8),
                fee: '0',
                nonce: Date.now() + 1,
                metadata: { referenceId, operation: 'NODE_FEE_75PCT', commissionRate: fee.commissionRate },
            });

            await this.ledgerService.recordTransaction({
                type: TransactionType.FEE_DISTRIBUTION,
                sender: recipient,
                recipient: 'SYSTEM_AFC_RESERVE_000000000000000000',
                amount: fee.afcReserveShare.toFixed(8),
                fee: '0',
                nonce: Date.now() + 2,
                metadata: { referenceId, operation: 'AFC_RESERVE_25PCT', commissionRate: fee.commissionRate },
            });

            // Step 3 — Update AFC reserve index (drives future emission price upward)
            this.emissionService.contributeToAfcReserve(fee.afcReserveShare);

            // Step 4 — On-chain record + supply snapshot
            await this.smartContractService.recordReference(referenceId, 'MINT', { amount, recipient });
            await this.updateSupplySnapshot(queryRunner, tx.hash, amount, 'MINT');
            await queryRunner.commitTransaction();

            this.eventEmitter.emit('token.mint', {
                amount,
                recipient,
                refId: referenceId,
                txHash: tx.hash,
                commission: fee.commission,
                nodeShare: fee.nodeShare,
                afcReserveShare: fee.afcReserveShare,
            });

            this.processReserve.recordTransactionVolume(txAmount);

            return { status: 'SUCCESS', txHash: tx.hash, amount: tx.amount, recipient: tx.recipient };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Mint failed: ${error.message}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async burn(amount: string, sender: string, bankDetailsId: string): Promise<any> {
        if (parseFloat(amount) <= 0) throw new BadRequestException('Amount must be positive');

        const currentBalance = await this.ledgerService.getBalance(sender);
        if (parseFloat(currentBalance) < parseFloat(amount)) {
            throw new BadRequestException(`Insufficient funds. Balance: ${currentBalance}, Required: ${amount}`);
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log(`Initiating BURN: ${amount} AROS from ${sender}`);

            const tx = await this.ledgerService.recordTransaction({
                type: TransactionType.BURN,
                sender: sender,
                recipient: this.BURN_ADDRESS,
                amount: amount,
                nonce: Date.now(),
                metadata: { bankDetailsId, operation: 'FIAT_WITHDRAWAL' }
            });

            // [NEW] Record On-Chain Event
            await this.smartContractService.recordReference(tx.hash, 'BURN', { amount: amount, sender: sender });

            await this.updateSupplySnapshot(queryRunner, tx.hash, amount, 'BURN');
            await queryRunner.commitTransaction();

            // Trigger Fiat Payout via Bridge (Asynchronous or Synchronous depending on policy)
            // Ideally async so if bank fails, we don't necessarily rollback burn? 
            // OR strict: if bank fails, we rollback burn.
            // For now, let's treat it as a subsequent action. If Mock Bank fails, we might just log it (or throw).
            // Let's await it to ensure user gets feedback.
            const bankTxId = await this.bridgeService.requestFiatPayout(amount, bankDetailsId);

            this.processReserve.recordTransactionVolume(parseFloat(amount));

            return { status: 'SUCCESS', txHash: tx.hash, message: `Tokens burned at Price ${this.emissionService.getCurrentEmissionPrice().toFixed(6)}. Fiat payout initiated via BB.`, bankTxId };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async getSupplyStats(): Promise<SupplySnapshot> {
        return this.supplyRepository.findOne({ order: { createdAt: 'DESC' } });
    }

    private async updateSupplySnapshot(runner: any, txHash: string, amount: string, type: 'MINT' | 'BURN') {
        const [lastSnapshot] = await runner.manager.find(SupplySnapshot, {
            order: { createdAt: 'DESC' },
            take: 1
        });

        const prevSupply = lastSnapshot ? parseFloat(lastSnapshot.circulatingSupply) : 0;
        const prevMinted = lastSnapshot ? parseFloat(lastSnapshot.totalMinted) : 0;
        const prevBurned = lastSnapshot ? parseFloat(lastSnapshot.totalBurned) : 0;
        const delta = parseFloat(amount);

        const newSnapshot = new SupplySnapshot();
        newSnapshot.triggerTransactionHash = txHash;

        if (type === 'MINT') {
            newSnapshot.circulatingSupply = (prevSupply + delta).toString();
            newSnapshot.totalMinted = (prevMinted + delta).toString();
            newSnapshot.totalBurned = prevBurned.toString();
        } else {
            newSnapshot.circulatingSupply = (prevSupply - delta).toString();
            newSnapshot.totalMinted = prevMinted.toString();
            newSnapshot.totalBurned = (prevBurned + delta).toString();
        }

        await runner.manager.save(SupplySnapshot, newSnapshot);
    }
}
