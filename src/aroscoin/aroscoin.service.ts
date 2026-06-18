import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClockService } from '../common/clock.service';
import { ArosCoinLedger } from './entities/aroscoin-ledger.entity';

/** A point-in-time view of the supply tallies. Consumed by AllSeeingEye.compareSupply. */
export interface SupplySnapshot {
    processMinted: number;
    processBurned: number;
    earnedRetained: number;
    timestamp: number;
}

/**
 * ArosCoinService — the unit ledger of AST.
 *
 * ArosCoin is the process unit of account: it expresses value created by a confirmed
 * value-exchange. This service holds the three running tallies (`processMinted`,
 * `processBurned`, `earnedRetained`) in a single persisted ledger row and derives every
 * supply figure from them. It mirrors `reference/ast-core/src/aroscoin.ts` exactly.
 *
 * Value enters the ledger only through recorded facts of confirmed work: Emission records
 * the process-part mint/burn for a PoT-verified process, and Commission records the earned
 * part paid for executed work. The service exposes record operations and read views; it
 * never originates value on its own and has no deposit or purchase path (project P5).
 *
 * Supply is derived, never assigned:
 *     totalSupply = (processMinted - processBurned) + earnedRetained
 * Because the process part is minted then burned within the same confirmed process, its net
 * contribution returns to zero (`processNet -> 0`, project I5), leaving totalSupply equal to
 * earnedRetained once cycles complete (project I6, spec I-AC-5).
 *
 * Spec: docs/specs/AST_ArosCoin_AGENT_EN.md
 * Reference: reference/ast-core/src/aroscoin.ts
 */
@Injectable()
export class ArosCoinService {
    /** Base used to derive internal price from the reserve index (spec formula). */
    readonly base = 1;

    /**
     * Shared one-time initialization of the single ledger row. Concurrent callers (e.g. the
     * parallel reads in a metrics snapshot on a fresh ledger) await this one promise, so the
     * zeroed row is created exactly once rather than each caller racing to insert it.
     */
    private initialization: Promise<void> | null = null;

    constructor(
        @InjectRepository(ArosCoinLedger)
        private readonly repo: Repository<ArosCoinLedger>,
        private readonly clock: ClockService,
    ) { }

    /** Ensure the single zeroed ledger row exists, creating it once on first access. */
    private async ensureLedger(): Promise<void> {
        if (!this.initialization) {
            this.initialization = (async () => {
                const existing = await this.repo.findOne({ where: { id: ArosCoinLedger.LEDGER_ID } });
                if (!existing) {
                    await this.repo.save(this.repo.create({
                        id: ArosCoinLedger.LEDGER_ID,
                        processMinted: 0,
                        processBurned: 0,
                        earnedRetained: 0,
                    }));
                }
            })();
        }
        return this.initialization;
    }

    /** Read the single ledger row, creating it on first access. */
    private async ledger(): Promise<ArosCoinLedger> {
        await this.ensureLedger();
        return this.repo.findOneOrFail({ where: { id: ArosCoinLedger.LEDGER_ID } });
    }

    /** Record issuance of the process part. Called by Emission for a verified process. */
    async recordMint(amount: number): Promise<void> {
        const row = await this.ledger();
        row.processMinted += amount;
        await this.repo.save(row);
    }

    /** Record the burn of the process part on cycle completion. Called by Emission. */
    async recordBurn(amount: number): Promise<void> {
        const row = await this.ledger();
        row.processBurned += amount;
        await this.repo.save(row);
    }

    /** Record value earned for executed work and retained by nodes/AST. Called by Commission. */
    async recordEarned(amount: number): Promise<void> {
        const row = await this.ledger();
        row.earnedRetained += amount;
        await this.repo.save(row);
    }

    /**
     * Derived supply identity (I6, spec I-AC-5):
     *     totalSupply = (processMinted - processBurned) + earnedRetained
     */
    async totalSupply(): Promise<number> {
        const row = await this.ledger();
        return (row.processMinted - row.processBurned) + row.earnedRetained;
    }

    /** Net of the process part; converges to 0 once cycles complete (I5). */
    async processNet(): Promise<number> {
        const row = await this.ledger();
        return row.processMinted - row.processBurned;
    }

    /** The retained earned value held by nodes/AST. */
    async retained(): Promise<number> {
        const row = await this.ledger();
        return row.earnedRetained;
    }

    /** Internal valuation from accumulated work: `internalPrice = base * reserveIndex`. */
    internalPrice(reserveIndex: number): number {
        return this.base * reserveIndex;
    }

    /** A point-in-time view of the three tallies, stamped with a deterministic tick. */
    async snapshot(): Promise<SupplySnapshot> {
        const row = await this.ledger();
        return {
            processMinted: row.processMinted,
            processBurned: row.processBurned,
            earnedRetained: row.earnedRetained,
            timestamp: this.clock.now(),
        };
    }

    /**
     * The supply view AllSeeingEye.compareSupply consumes: `{ totalSupply, retained }`.
     * After completed cycles these are equal, which is the integrity invariant the Eye checks.
     */
    async supplyView(): Promise<{ totalSupply: number; retained: number }> {
        const row = await this.ledger();
        return {
            totalSupply: (row.processMinted - row.processBurned) + row.earnedRetained,
            retained: row.earnedRetained,
        };
    }
}
