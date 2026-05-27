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

    // ── System addresses (canonical) ────────────────────────────────────────
    private readonly MINT_ADDRESS        = 'SYSTEM_MINT_AUTHORITY_000000000000000000';
    private readonly BURN_ADDRESS        = 'SYSTEM_BURN_VAULT_00000000000000000000';
    private readonly FEE_POOL_ADDRESS    = 'SYSTEM_FEE_POOL_00000000000000000000';
    private readonly NODE_POOL_ADDRESS   = 'SYSTEM_NODE_POOL_00000000000000000000';
    private readonly AFC_RESERVE_ADDRESS = 'SYSTEM_AFC_RESERVE_000000000000000000';

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
     * @deprecated Use {@link mintForTransaction} for canonical 1:1 emission.
     *
     * This method handles **fiat-bridge deposit** operations only (FIAT_DEPOSIT).
     * Unlike the canonical emission cycle, emitted ARO are NOT burned here — the user
     * holds them until a corresponding `burn()` (withdrawal) is called.
     *
     * Canonical fee distribution IS applied:
     *   Commission = amount × 0.5%
     *   75% → SYSTEM_NODE_POOL   (processing-node rewards)
     *   25% → SYSTEM_AFC_RESERVE (reserve growth → price index rises)
     *
     * @param amount      Gross deposit amount in ARO
     * @param recipient   Recipient address
     * @param referenceId External reference / bank transaction ID
     */
    async mint(amount: string, recipient: string, referenceId: string): Promise<any> {
        if (parseFloat(amount) <= 0) throw new BadRequestException('Amount must be positive');

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const amount_num    = parseFloat(amount);
            const emissionCalc  = this.emissionService.calculate(amount_num);

            this.logger.log(
                `[Bridge Deposit] ${amount} AROS → ${recipient} (Ref: ${referenceId}) | ` +
                `Commission: ${emissionCalc.commission.toFixed(8)} ARO ` +
                `(Nodes: ${emissionCalc.nodeShare.toFixed(8)}, AFC: ${emissionCalc.afcReserveShare.toFixed(8)})`,
            );

            // Step 1 — Mint ARO to recipient (fiat deposit; no burn — user holds ARO)
            const tx = await this.ledgerService.recordTransaction({
                type:      TransactionType.MINT,
                sender:    this.MINT_ADDRESS,
                recipient: recipient,
                amount:    amount,
                fee:       emissionCalc.commission.toFixed(8), // canonical commission
                nonce:     Date.now(),
                metadata:  { referenceId, operation: 'FIAT_DEPOSIT' },
            });

            // Record on-chain event
            await this.smartContractService.recordReference(referenceId, 'MINT', { amount, recipient });

            // Step 2a — 75% commission → node pool (canonical split)
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    this.FEE_POOL_ADDRESS,
                recipient: this.NODE_POOL_ADDRESS,
                amount:    emissionCalc.nodeShare.toFixed(8),
                fee:       '0',
                nonce:     Date.now() + 1,
                metadata:  { referenceId, operation: 'NODE_FEE_75PCT', commissionRate: emissionCalc.commissionRate },
            });

            // Step 2b — 25% commission → AFC reserve (canonical split)
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    this.FEE_POOL_ADDRESS,
                recipient: this.AFC_RESERVE_ADDRESS,
                amount:    emissionCalc.afcReserveShare.toFixed(8),
                fee:       '0',
                nonce:     Date.now() + 2,
                metadata:  { referenceId, operation: 'AFC_RESERVE_25PCT', commissionRate: emissionCalc.commissionRate },
            });

            await this.updateSupplySnapshot(queryRunner, tx.hash, amount, 'MINT');
            await queryRunner.commitTransaction();

            // Emit event for The All-Seeing Eye
            this.eventEmitter.emit('token.mint', {
                amount,
                recipient,
                refId:          referenceId,
                txHash:         tx.hash,
                commission:     emissionCalc.commission,
                nodeShare:      emissionCalc.nodeShare,
                afcReserveShare: emissionCalc.afcReserveShare,
            });

            // Update process reserve (price index driven by volume)
            this.processReserve.recordTransactionVolume(amount_num);
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

    /**
     * @deprecated Pair with the deprecated {@link mint}. Used only for fiat-bridge withdrawals.
     *
     * Burns ARO and triggers fiat payout via the bridge. Canonical fee distribution IS applied:
     *   Commission = amount × 0.5%
     *   75% → SYSTEM_NODE_POOL
     *   25% → SYSTEM_AFC_RESERVE
     *
     * Fiat payout is dispatched AFTER the on-chain burn is committed. If the bridge call
     * fails, the burn is NOT rolled back — callers should implement retry logic at the
     * bridge layer.
     *
     * @param amount        ARO amount to burn
     * @param sender        Holder address
     * @param bankDetailsId Bank account reference for fiat payout
     */
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
            const amount_num   = parseFloat(amount);
            const emissionCalc = this.emissionService.calculate(amount_num);

            this.logger.log(
                `[Bridge Withdrawal] Burn ${amount} AROS from ${sender} | ` +
                `Commission: ${emissionCalc.commission.toFixed(8)} ARO ` +
                `(Nodes: ${emissionCalc.nodeShare.toFixed(8)}, AFC: ${emissionCalc.afcReserveShare.toFixed(8)})`,
            );

            // Step 1 — Burn ARO (fiat withdrawal)
            const tx = await this.ledgerService.recordTransaction({
                type:      TransactionType.BURN,
                sender:    sender,
                recipient: this.BURN_ADDRESS,
                amount:    amount,
                fee:       emissionCalc.commission.toFixed(8), // canonical commission
                nonce:     Date.now(),
                metadata:  { bankDetailsId, operation: 'FIAT_WITHDRAWAL' },
            });

            // Record on-chain event
            await this.smartContractService.recordReference(tx.hash, 'BURN', { amount, sender });

            // Step 2a — 75% commission → node pool (canonical split)
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    this.FEE_POOL_ADDRESS,
                recipient: this.NODE_POOL_ADDRESS,
                amount:    emissionCalc.nodeShare.toFixed(8),
                fee:       '0',
                nonce:     Date.now() + 1,
                metadata:  { bankDetailsId, operation: 'NODE_FEE_75PCT', commissionRate: emissionCalc.commissionRate },
            });

            // Step 2b — 25% commission → AFC reserve (canonical split)
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    this.FEE_POOL_ADDRESS,
                recipient: this.AFC_RESERVE_ADDRESS,
                amount:    emissionCalc.afcReserveShare.toFixed(8),
                fee:       '0',
                nonce:     Date.now() + 2,
                metadata:  { bankDetailsId, operation: 'AFC_RESERVE_25PCT', commissionRate: emissionCalc.commissionRate },
            });

            await this.updateSupplySnapshot(queryRunner, tx.hash, amount, 'BURN');
            await queryRunner.commitTransaction();

            // Trigger fiat payout via bridge (post-commit — bridge retry is external concern)
            const bankTxId = await this.bridgeService.requestFiatPayout(amount, bankDetailsId);

            // Update process reserve (withdrawal is economic activity → price index rises)
            this.processReserve.recordTransactionVolume(amount_num);
            this.tokenomicsService.updateInternalValuation();

            return {
                status:  'SUCCESS',
                txHash:  tx.hash,
                message: `Tokens burned. Commission: ${emissionCalc.commission.toFixed(8)} ARO. Fiat payout initiated.`,
                bankTxId,
            };
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
