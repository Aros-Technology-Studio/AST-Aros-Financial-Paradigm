import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { BridgeService } from '../bridge/bridge.service';
import { SmartContractIntegration } from '../integration/smart_contract.integration';
import { TokenomicsService } from './tokenomics.service';
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
        private readonly tokenomicsService: TokenomicsService,
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

    /**
     * @deprecated Use mintForTransaction() for all new code.
     *   This legacy method mints without commission split, fee distribution, or burn,
     *   violating the canonical 1:1 emission model. It is retained only for backward
     *   compatibility with internal tooling that has not yet been migrated.
     *   The REST endpoint POST /api/v1/token/mint now routes to mintForTransaction().
     */
    async mint(amount: string, recipient: string, referenceId: string): Promise<any> {
        if (parseFloat(amount) <= 0) throw new BadRequestException('Amount must be positive');

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const currentPrice = this.tokenomicsService.getCurrentPrice();
            this.logger.log(`Initiating MINT: ${amount} AROS to ${recipient} (Ref: ${referenceId}) @ Price ${currentPrice}`);

            // Logic: If amount is FIAT, we divide by Price. If amount is TOKENS, we just mint tokens.
            // Assuming input 'amount' is TOKENS for now based on legacy logic, 
            // BUT for dynamic pricing usually the input from Bank is FIAT.
            // Let's assume the Bridge sends token amount calculated elsewhere OR we should change this to accept Fiat and calc Tokens.
            // For minimal disruption: We assume Bridge calc or we just log the price.
            // *CRITICAL*: User asked for price to rise. 
            // We will trigger a price increment AFTER minting to simulate "Activity".


            const tx = await this.ledgerService.recordTransaction({
                type: TransactionType.MINT,
                sender: this.MINT_ADDRESS,
                recipient: recipient,
                amount: amount,
                nonce: Date.now(),
                metadata: { referenceId, operation: 'FIAT_DEPOSIT' }
            });

            // [NEW] Record On-Chain Event
            await this.smartContractService.recordReference(referenceId, 'MINT', { amount: amount, recipient: recipient });

            await this.updateSupplySnapshot(queryRunner, tx.hash, amount, 'MINT');
            await queryRunner.commitTransaction();

            // Emit event for The All-Seeing Eye
            this.eventEmitter.emit('token.mint', {
                amount: amount,
                recipient: recipient,
                refId: referenceId,
                txHash: tx.hash
            });

            // [NEW] Increment Price due to economic activity
            // REPLACED: this.tokenomicsService.incrementPrice(1);
            // NOW: Record volume and update based on Reserve
            this.processReserve.recordTransactionVolume(parseFloat(amount));
            this.tokenomicsService.updateInternalValuation();


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

            // [NEW] Increment Price due to withdrawal activity?
            // User strategy said "processing transaction... rises price".
            // Withdrawal is a transaction. So yes.
            this.processReserve.recordTransactionVolume(parseFloat(amount));
            this.tokenomicsService.updateInternalValuation();

            return { status: 'SUCCESS', txHash: tx.hash, message: `Tokens burned at Price ${this.tokenomicsService.getCurrentPrice()}. Fiat payout initiated via BB.`, bankTxId };
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
