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
        // FEE_DISTRIBUTION entries are ledger accounting records — they do NOT debit the
        // recipient's wallet balance. The recipient retains the full emissionAmount until
        // the BURN step, enabling net-zero circulating supply per canonical TX cycle.
        const burnAmount = emission;

        return {
            transactionAmount,
            emissionAmount:   emission,
            commission,
            nodeShare,
            afcReserveShare:  afcShare,
            burnAmount,
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
     * Halted immediately when KILL_SWITCH=true (emergency brake — see aro_emission_protocol.md §VIII).
     */
    async processTransactionEmission(
        transactionAmount: number,
        recipientAddress: string,
        referenceId: string,
        commissionRate?: number,
    ): Promise<EmissionResult> {
        if (process.env.KILL_SWITCH === 'true') {
            this.logger.error(`[Emission] KILL_SWITCH active — emission halted for TX=${referenceId}`);
            throw new BadRequestException('Emission engine is halted (KILL_SWITCH=true). Contact protocol governance.');
        }

        const result = this.calculate(transactionAmount, commissionRate);

        this.logger.log(
            `[Emission] TX=${referenceId} Amount=${transactionAmount} ` +
            `→ Emit=${result.emissionAmount} Fee=${result.commission} ` +
            `(Nodes=${result.nodeShare} AFC=${result.afcReserveShare}) Burn=${result.burnAmount}`,
        );

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const mgr  = queryRunner.manager;
            const base = Date.now();

            // Step 1 — Mint ARO 1:1 to recipient (atomic: shares outer queryRunner.manager)
            const mintTx = await this.ledgerService.recordTransaction({
                type:      TransactionType.MINT,
                sender:    this.SYSTEM_EMISSION_AUTHORITY,
                recipient: recipientAddress,
                amount:    result.emissionAmount.toFixed(8),
                fee:       '0',
                nonce:     base,
                metadata:  { referenceId, operation: 'CANONICAL_1_1_EMISSION' },
            }, mgr);

            // Step 2a — Record 75% commission to node pool (atomic)
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    recipientAddress,
                recipient: this.NODE_POOL_ADDRESS,
                amount:    result.nodeShare.toFixed(8),
                fee:       '0',
                nonce:     base + 1,
                metadata:  { referenceId, operation: 'NODE_FEE_75PCT', commissionRate: result.commissionRate },
            }, mgr);

            // Step 2b — Record 25% commission to AFC reserve (atomic)
            await this.ledgerService.recordTransaction({
                type:      TransactionType.FEE_DISTRIBUTION,
                sender:    recipientAddress,
                recipient: this.AFC_RESERVE_ADDRESS,
                amount:    result.afcReserveShare.toFixed(8),
                fee:       '0',
                nonce:     base + 2,
                metadata:  { referenceId, operation: 'AFC_RESERVE_25PCT', commissionRate: result.commissionRate },
            }, mgr);

            // Step 3 — Burn full emissionAmount (= transactionAmount). FEE_DISTRIBUTION
            // entries in steps 2a/2b are accounting-only records and do not reduce the
            // recipient's wallet balance, so the full emissionAmount is available to burn.
            await this.ledgerService.recordTransaction({
                type:      TransactionType.BURN,
                sender:    recipientAddress,
                recipient: this.BURN_ADDRESS,
                amount:    result.burnAmount.toFixed(8),
                fee:       '0',
                nonce:     base + 3,
                metadata:  { referenceId, operation: 'POST_TX_CANONICAL_BURN' },
            }, mgr);

            // Step 4 — Update supply snapshot
            await this.updateSupplySnapshot(queryRunner, referenceId, result);

            await queryRunner.commitTransaction();

            // Step 5 — Update AFC reserve AFTER successful DB commit.
            // updateAfcReserve() mutates in-memory state only; if called before commitTransaction()
            // and a later step throws, the DB rolls back but the in-memory index is already
            // incremented — causing a permanent desync between on-chain records and the price index.
            this.updateAfcReserve(result.afcReserveShare);

            this.logger.log(`[Emission] TX=${referenceId} completed. AFC Reserve Index: ${this.afcReserveState.reserveIndex.toFixed(6)}`);

            return { ...result, mintTxHash: mintTx.hash };
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
     * Price index rises monotonically as the reserve accumulates.
     * Called per-TX (internally) and per-epoch (from FeeDistributionService).
     */
    updateAfcReserve(afcAmount: number): void {
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
     * Records an AFC reserve contribution from an external source (e.g. epoch fee distribution).
     * Keeps the in-memory reserveIndex in sync when AFC reserve grows outside of
     * processTransactionEmission() — e.g. after FeeDistributionService finalizes an epoch.
     */
    recordAfcContribution(amount: number): void {
        if (amount > 0) {
            this.updateAfcReserve(amount);
        }
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
        this.config.defaultCommissionRate = newRate;
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

        // Canonical TX cycle: mint emissionAmount, burn emissionAmount.
        // FEE_DISTRIBUTION records are accounting-only; they don't affect wallet balances.
        // Net circulating supply change per TX = 0.
        const newSnapshot        = new SupplySnapshot();
        newSnapshot.triggerTransactionHash  = referenceId;
        newSnapshot.totalMinted             = (prevMinted + result.emissionAmount).toFixed(8);
        newSnapshot.totalBurned             = (prevBurned  + result.emissionAmount).toFixed(8);
        newSnapshot.circulatingSupply       = prevSupply.toFixed(8);

        await runner.manager.save(SupplySnapshot, newSnapshot);
    }
}
