import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { ClockService } from '../common/clock.service';
import { NodeChainService } from '../nodechain/nodechain.service';
import { ReserveService } from '../reserve/reserve.service';
import { ReleasePhase } from './entities/release-phase.entity';

/** Outcome of a maturity check, carrying the metrics that produced it. */
export interface MaturityCheck {
    mature: boolean;
    reserveIndex: number;
    velocity: number;
}

/** Outcome of an activation attempt. */
export interface ActivateResult {
    activated: boolean;
    active: boolean;
    reserveIndex: number;
    velocity: number;
}

/**
 * ReleaseService — the maturity gate to broader circulation.
 *
 * Release decides when the economy is mature enough to move from internal-only roles to
 * broader circulation, and records that transition. Maturity requires BOTH a capitalization
 * condition and an activity condition: `(reserveIndex > threshold) AND (velocity > target)`
 * (spec I-RL-1). It mirrors `reference/ast-core/src/release.ts`.
 *
 * The check reads `reserveIndex` from Reserve and computes velocity as
 * `processVolume_24h / circulatingSupply`, where circulating supply is ArosCoin's derived
 * total supply. Both inputs come from recorded history, so identical metrics always yield
 * the same verdict (spec I-RL-2 / project I4: deterministic).
 *
 * Until both conditions hold, the phase stays inactive and circulation remains bounded to
 * internal roles (spec I-RL-3). On a satisfied check, `activate` appends a
 * `release.activated` snapshot to NodeChain — the observable record of the transition
 * (spec I-RL-4) — and marks the phase active.
 *
 * Spec: docs/specs/AST_Release_AGENT_EN.md
 * Reference: reference/ast-core/src/release.ts
 */
@Injectable()
export class ReleaseService {
    constructor(
        @InjectRepository(ReleasePhase)
        private readonly repo: Repository<ReleasePhase>,
        private readonly reserve: ReserveService,
        private readonly coin: ArosCoinService,
        private readonly chain: NodeChainService,
        private readonly clock: ClockService,
    ) { }

    /** Read the phase row, creating the single inactive row on first access. */
    private async phase(): Promise<ReleasePhase> {
        const existing = await this.repo.findOne({ where: { id: ReleasePhase.PHASE_ID } });
        if (existing) return existing;
        const fresh = this.repo.create({
            id: ReleasePhase.PHASE_ID,
            active: false,
            activatedAt: null,
            reserveIndexAtActivation: null,
            velocityAtActivation: null,
        });
        return this.repo.save(fresh);
    }

    /**
     * Activity metric: `velocity = processVolume_24h / circulatingSupply`. Guarded against a
     * zero (or empty) circulating supply, returning 0 so the activity condition cannot be met
     * on an empty economy.
     */
    async velocity(processVolume24h: number): Promise<number> {
        const circulatingSupply = await this.coin.totalSupply();
        if (circulatingSupply <= 0) return 0;
        return processVolume24h / circulatingSupply;
    }

    /**
     * Evaluate the dual maturity condition without changing state:
     * `mature = (reserveIndex > threshold) AND (velocity > target)` (spec I-RL-1).
     * Returns the metrics so callers can record or report them.
     */
    async check(threshold: number, target: number, processVolume24h: number): Promise<MaturityCheck> {
        const reserveIndex = await this.reserve.reserveIndex();
        const velocity = await this.velocity(processVolume24h);
        const mature = reserveIndex > threshold && velocity > target;
        return { mature, reserveIndex, velocity };
    }

    /**
     * Activate broader circulation when — and only when — both conditions hold. On a mature
     * check this appends a `release.activated` snapshot to NodeChain (spec I-RL-4) and marks
     * the phase active with the metrics that justified it. When not mature, nothing is
     * recorded and the phase stays inactive, so circulation remains bounded (spec I-RL-3).
     * Activating an already-active phase is a no-op that reports the current state.
     */
    async activate(threshold: number, target: number, processVolume24h: number): Promise<ActivateResult> {
        const { mature, reserveIndex, velocity } = await this.check(threshold, target, processVolume24h);
        const row = await this.phase();

        if (row.active) {
            return { activated: false, active: true, reserveIndex, velocity };
        }
        if (!mature) {
            return { activated: false, active: false, reserveIndex, velocity };
        }

        const activatedAt = this.clock.now();
        await this.chain.append('release.activated', {
            reserveIndex,
            velocity,
            threshold,
            target,
        });

        row.active = true;
        row.activatedAt = activatedAt;
        row.reserveIndexAtActivation = reserveIndex;
        row.velocityAtActivation = velocity;
        await this.repo.save(row);

        return { activated: true, active: true, reserveIndex, velocity };
    }

    /** Whether broader circulation is currently active. */
    async isActive(): Promise<boolean> {
        const row = await this.phase();
        return row.active;
    }
}
