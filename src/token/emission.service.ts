import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EmissionConfig, EmissionResult, AfcReserveState } from './emission.interfaces';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

/**
 * Canonical 1:1 Emission Engine for ArosCoin.
 *
 * Rules:
 *   Emission  = Transaction Amount              (1:1)
 *   Fee       = Transaction Amount × rate       (default 0.5%)
 *   Fee split: 75% → nodes, 25% → AFC reserve
 *   ARO burns on transaction completion
 *   AFC reserve growth → price of next emission rises
 */
@Injectable()
export class EmissionService {
    private readonly logger = new Logger(EmissionService.name);

    private readonly SYSTEM_EMISSION_AUTHORITY = 'SYSTEM_EMISSION_AUTHORITY_00000000000';
    private readonly AFC_RESERVE_ADDRESS       = 'SYSTEM_AFC_RESERVE_000000000000000000';
    private readonly NODE_POOL_ADDRESS         = 'SYSTEM_NODE_POOL_00000000000000000000';
    private readonly BURN_ADDRESS              = 'SYSTEM_BURN_VAULT_00000000000000000000';

    private readonly config: EmissionConfig = {
        defaultCommissionRate: 0.005, // 0.5%
        nodeShareRatio:        0.75,
        afcReserveRatio:       0.25,
    };

    private afcReserveState: AfcReserveState = {
        totalReserve:     0,
        reserveIndex:     1.0,
        transactionCount: 0,
        lastUpdated:      Date.now(),
    };

    constructor(
        @InjectRepository(SupplySnapshot)
        private readonly supplyRepository: Repository<SupplySnapshot>,
        private readonly ledgerService: LedgerService,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * Calculates all emission values for a given transaction amount.
     * Pure function — no side effects.
     */
    calculate(transactionAmount: number, commissionRate?: number): EmissionResult {
        if (transactionAmount <= 0) {
            throw new BadRequestException('Transaction amount must be positive');
        }

        const rate       = commissionRate ?? this.config.defaultCommissionRate;
        const emission   = transactionAmount;                       // 1:1
        const commission = transactionAmount * rate;
        const nodeShare  = commission * this.config.nodeShareRatio;
        const afcShare   = commission * this.config.afcReserveRatio;

        return {
            transactionAmount,
            emissionAmount:   emission,
            commission,
            nodeShare,
            afcReserveShare:  afcShare,
            commissionRate:   rate,
        };
    }

    /**
     * Full canonical emission lifecycle for one transaction:
     *   1. Mint emissionAmount ARO to recipient (1:1)
     *   2. Record commission split to node pool and AFC reserve
     *   3. Grow AFC reserve → update price index
     *   4. Burn the emitted ARO (ARO are transient — they exist only during the transaction)
     *
     * Returns the emission result for audit logging.
     */
    async processTransactionEmission(
        transactionAmount: number,
        recipientAddress: string,
        referenceId: string,
        commissionRate?: number,
    ): Promise<EmissionResult> {
        const result = this.calculate(transactionAmount, commissionRate);

        this.logger.log(
            `[Emission] TX=${referenceId} Amount=${transactionAmount} ` +
            `→ Emit=${result.emissionAmount} Fee=${result.commission} ` +
            `(Nodes=${result.nodeShare} AFC=${result.afcReserveShare})`,
        );

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Step 1 — Mint ARO 1:1 to recipient
            await this.ledgerService.recordTransaction({
                type:      TransactionType.MINT,
                sender:    this.SYSTEM_EMISSION_AUTHORITY,
                recipient: recipientAddress,
                amount:    result.emissionAmount.toFixed(8),
                fee:       '0',
                nonce:     Date.now(),
                metadata:  { referenceId, operation: 'CANONICAL_1_1_EMISSION' },
            });

            // Step 2a — Record 75% commission to node pool
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    recipientAddress,
                recipient: this.NODE_POOL_ADDRESS,
                amount:    result.nodeShare.toFixed(8),
                fee:       '0',
                nonce:     Date.now() + 1,
                metadata:  { referenceId, operation: 'NODE_FEE_75PCT', commissionRate: result.commissionRate },
            });

            // Step 2b — Record 25% commission to AFC reserve
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    recipientAddress,
                recipient: this.AFC_RESERVE_ADDRESS,
                amount:    result.afcReserveShare.toFixed(8),
                fee:       '0',
                nonce:     Date.now() + 2,
                metadata:  { referenceId, operation: 'AFC_RESERVE_25PCT', commissionRate: result.commissionRate },
            });

            // Step 3 — Update AFC reserve state (price index rises)
            this.accumulateAfcReserve(result.afcReserveShare);

            // Step 4 — Burn emission (ARO are transient per canonical model)
            await this.ledgerService.recordTransaction({
                type:      TransactionType.BURN,
                sender:    recipientAddress,
                recipient: this.BURN_ADDRESS,
                amount:    result.emissionAmount.toFixed(8),
                fee:       '0',
                nonce:     Date.now() + 3,
                metadata:  { referenceId, operation: 'POST_TX_CANONICAL_BURN' },
            });

            // Step 5 — Update supply snapshot
            await this.updateSupplySnapshot(queryRunner, referenceId, result);

            await queryRunner.commitTransaction();
            this.logger.log(`[Emission] TX=${referenceId} completed. AFC Reserve Index: ${this.afcReserveState.reserveIndex.toFixed(6)}`);

            return result;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`[Emission] TX=${referenceId} failed: ${error.message}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Grows the AFC reserve and recalculates the emission price index.
     * Called internally on each TX emission and externally by FeeDistributionService
     * after epoch-level AFC contributions so the price index stays in sync.
     */
    accumulateAfcReserve(afcAmount: number): void {
        this.afcReserveState.totalReserve     += afcAmount;
        this.afcReserveState.transactionCount += 1;
        this.afcReserveState.lastUpdated       = Date.now();

        // Index = 1.0 + sqrt(totalReserve) / 10_000
        // Gives sub-linear growth: stable at low volume, meaningful at scale.
        this.afcReserveState.reserveIndex =
            1.0 + Math.sqrt(this.afcReserveState.totalReserve) / 10_000;

        this.logger.log(
            `[AFC Reserve] +${afcAmount.toFixed(4)} → Total=${this.afcReserveState.totalReserve.toFixed(4)} ` +
            `Index=${this.afcReserveState.reserveIndex.toFixed(6)}`,
        );
    }

    /**
     * Returns the current AFC reserve state (read-only snapshot).
     */
    getAfcReserveState(): Readonly<AfcReserveState> {
        return { ...this.afcReserveState };
    }

    /**
     * Returns the current emission price derived from AFC reserve index.
     * Every new emission costs more as the reserve grows.
     */
    getCurrentEmissionPrice(): number {
        return this.afcReserveState.reserveIndex;
    }

    /**
     * Allows governance to update the commission rate.
     */
    updateCommissionRate(newRate: number): void {
        if (newRate <= 0 || newRate >= 1) {
            throw new BadRequestException('Commission rate must be between 0 and 1 exclusive');
        }
        (this.config as any).defaultCommissionRate = newRate;
        this.logger.log(`[Emission] Commission rate updated to ${(newRate * 100).toFixed(3)}%`);
    }

    private async updateSupplySnapshot(runner: any, referenceId: string, result: EmissionResult): Promise<void> {
        const [lastSnapshot] = await runner.manager.find(SupplySnapshot, {
            order: { createdAt: 'DESC' },
            take:  1,
        });

        const prevMinted  = lastSnapshot ? parseFloat(lastSnapshot.totalMinted)       : 0;
        const prevBurned  = lastSnapshot ? parseFloat(lastSnapshot.totalBurned)        : 0;
        const prevSupply  = lastSnapshot ? parseFloat(lastSnapshot.circulatingSupply)  : 0;

        // Mint then burn in the same TX cycle → net circulating supply change = 0
        // but totalMinted and totalBurned both increase (for audit trail).
        const newSnapshot        = new SupplySnapshot();
        newSnapshot.triggerTransactionHash  = referenceId;
        newSnapshot.totalMinted             = (prevMinted + result.emissionAmount).toFixed(8);
        newSnapshot.totalBurned             = (prevBurned + result.emissionAmount).toFixed(8);
        newSnapshot.circulatingSupply       = prevSupply.toFixed(8); // net zero (burn cancels mint)

        await runner.manager.save(SupplySnapshot, newSnapshot);
    }
}
