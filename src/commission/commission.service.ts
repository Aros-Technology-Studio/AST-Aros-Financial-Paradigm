import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { ClockService } from '../common/clock.service';
import { NodeChainService } from '../nodechain/nodechain.service';
import { NodesService } from '../nodes/nodes.service';
import { PotService } from '../pot/pot.service';
import { ReserveService } from '../reserve/reserve.service';
import { DistributionEntry, Epoch } from './entities/epoch.entity';

/** One unit of confirmed participation: a node took part in a given process within an epoch. */
export interface Participation {
    processId: string;
    nodeId: string;
}

/** Outcome of finalizing an epoch, returned to callers and recorded in NodeChain. */
export interface FinalizeResult {
    epochNumber: number;
    distributionLog: DistributionEntry[];
    operationalMargin: number;
    paid: number;
    totalFees: number;
    /** True when Σ(payments) + operationalMargin == totalFees within float epsilon (I7). */
    reconciled: boolean;
}

/** Tolerance for the reconciliation identity, mirroring the reference's 1e-9 bound. */
const RECONCILE_EPSILON = 1e-9;

/** Recipient label for the 25% AFC commission share routed to the Reserve. */
const MARGIN_RECIPIENT = 'AFC_RESERVE';

/** Distribution-log reason tag for node work payments. */
const REASON_WORK = 'work_weight';

/** Distribution-log reason tag for the AFC reserve allocation. */
const REASON_AFC = 'afc_reserve';

/**
 * CommissionService — the settlement controller of AST.
 *
 * Commission computes the operation fee, consolidates fees into a per-epoch operational
 * pool, and on epoch finalization distributes payment by the canonical 75/25 split:
 *   - 75% to nodes, proportional to their PoT-confirmed participation weight.
 *   - 25% to the AFC Reserve (via `ReserveService.addAfcAccrual`), growing the capitalization
 *     index and raising the internal price of the next emission cycle.
 *
 * It mirrors `reference/ast-core/src/commission.ts`:
 *   - `computeFee(amount)`        = amount × feeRate (default 0.5%; optionally scaled by overloadRate).
 *   - `accrue(epoch, fee, parts)` adds the fee to the open epoch pool and remembers which
 *                                 nodes participated in which process for that fee.
 *   - `finalizeEpoch(epoch)`      pays nodes proportionally to weight, routes the AFC share, and
 *                                 records the distribution in NodeChain.
 *
 * Payment is strictly post-factum and gated by PoT: a participation counts toward weight only
 * when its process carries a verdict with `verified === 1` (spec I-CM-1/I-CM-2, project
 * P2/I2). Presence or readiness alone earns nothing — only confirmed work does (I-CM-5).
 * The pool reconciles to zero remainder: Σ(payments) + afcMargin == Σ(fees) per
 * epoch (project I7, spec I-CM-4). Distribution is deterministic for identical inputs (I4).
 *
 * Spec: docs/specs/AST_Commission_AGENT_EN.md
 * Reference: reference/ast-core/src/commission.ts
 */
@Injectable()
export class CommissionService {
    /** Fee fraction of the operation amount (canonical default 0.5%). */
    readonly feeRate = 0.005;

    /** Share of the pool routed to the AFC Reserve (canonical 25%). The remaining 75% pays nodes. */
    readonly marginRate = 0.25;

    /**
     * Confirmed participations remembered per open epoch, in insertion order. Mirrors the
     * reference's in-memory `contributions`; durable pool figures live in the Epoch row.
     */
    private readonly participation = new Map<number, Participation[]>();

    constructor(
        @InjectRepository(Epoch)
        private readonly repo: Repository<Epoch>,
        private readonly nodes: NodesService,
        private readonly pot: PotService,
        private readonly chain: NodeChainService,
        private readonly coin: ArosCoinService,
        private readonly reserve: ReserveService,
        private readonly clock: ClockService,
    ) { }

    /**
     * Compute the operation fee from the operation amount: `fee = amount * feeRate`. An
     * optional `overloadRate` yields the dynamic fee `fee * (1 + overloadRate)` per spec.
     */
    computeFee(amount: number, overloadRate = 0): number {
        const fee = amount * this.feeRate;
        return fee * (1 + overloadRate);
    }

    /**
     * Accrue a fee into the open epoch pool: `pool[epoch] += fee`. The epoch row is created on
     * first accrual. `participants` records which nodes took part in which process for this
     * fee, so finalization can weight payment by PoT-confirmed work only.
     */
    async accrue(
        epochNumber: number,
        fee: number,
        participants: Participation[] = [],
    ): Promise<Epoch> {
        const epoch = await this.openEpoch(epochNumber);
        epoch.totalFees += fee;
        const saved = await this.repo.save(epoch);

        const recorded = this.participation.get(epochNumber) ?? [];
        recorded.push(...participants);
        this.participation.set(epochNumber, recorded);
        return saved;
    }

    /**
     * Finalize an epoch post-factum: keep only PoT-confirmed participation (verified === 1),
     * sum each node's confirmed-participation weight, distribute 75% of the pool proportionally
     * to nodes (`paymentToNode = (weight * distributable) / Σweights`), route the canonical
     * 25% AFC share to the Reserve as an audit-trail accrual (reserveIndex is driven by confirmed
     * process volume, not by AFC accruals; I-RS-1), record the distribution
     * in NodeChain, and mark the epoch finalized. The pool reconciles with no remainder (I7).
     */
    async finalizeEpoch(epochNumber: number): Promise<FinalizeResult> {
        const epoch = await this.requireEpoch(epochNumber);
        if (epoch.status !== 'open') {
            return this.toResult(epoch);
        }

        const confirmedWeights = await this.confirmedWeights(epochNumber);
        const totalWeight = [...confirmedWeights.values()].reduce((sum, w) => sum + w, 0);

        const total = epoch.totalFees;
        const distributable = total * (1 - this.marginRate); // 75% to nodes

        const distributionLog: DistributionEntry[] = [];
        let paid = 0;

        if (totalWeight > 0) {
            // Iterate node ids in sorted order so the distribution is deterministic (I4).
            const nodeIds = [...confirmedWeights.keys()].sort();
            for (const nodeId of nodeIds) {
                const weight = confirmedWeights.get(nodeId)!;
                const amount = (weight * distributable) / totalWeight;
                await this.nodes.receivePayment(nodeId, amount);
                await this.coin.recordEarned(amount);
                paid += amount;
                distributionLog.push({ nodeId, amount, reason: REASON_WORK });
            }
        }

        // The 25% AFC share (plus any distributable not absorbed by nodes when weight == 0)
        // routes to the Reserve as an audit-trail accrual. The pool always reconciles to
        // zero remainder (I7). The reserveIndex formula uses confirmed process volume, not
        // AFC accruals; the reserve index rises as more PoT-verified processes run.
        const allocatedMargin = total - paid;
        await this.reserve.addAfcAccrual(allocatedMargin);
        distributionLog.push({
            nodeId: MARGIN_RECIPIENT,
            amount: allocatedMargin,
            reason: REASON_AFC,
        });

        epoch.distributionLog = distributionLog;
        epoch.operationalMargin = allocatedMargin;
        epoch.status = 'finalized';
        epoch.endTime = this.clock.now();
        await this.repo.save(epoch);

        const reconciled = Math.abs(paid + allocatedMargin - total) < RECONCILE_EPSILON;
        await this.chain.append('commission.epoch.finalized', {
            epochNumber,
            totalFees: total,
            operationalMargin: allocatedMargin,
            paid,
            reconciled,
            distributionLog,
        });

        this.participation.delete(epochNumber);
        return { epochNumber, distributionLog, operationalMargin: allocatedMargin, paid, totalFees: total, reconciled };
    }

    /** Return the epoch by number, or null when no such epoch exists. */
    async getEpoch(epochNumber: number): Promise<Epoch | null> {
        return this.repo.findOne({ where: { epochNumber } });
    }

    /** Return every epoch in ascending order. */
    async list(): Promise<Epoch[]> {
        return this.repo.find({ order: { epochNumber: 'ASC' } });
    }

    /**
     * Sum each node's weight across its PoT-confirmed participations in the epoch. A
     * participation counts only when its process verdict is `verified === 1`; a node may
     * accumulate weight from several confirmed processes. Nodes that merely registered but
     * never took part in a confirmed process do not appear, so presence earns nothing.
     */
    private async confirmedWeights(epochNumber: number): Promise<Map<string, number>> {
        const weights = new Map<string, number>();
        const parts = this.participation.get(epochNumber) ?? [];
        const verdictCache = new Map<string, boolean>();

        for (const { processId, nodeId } of parts) {
            let confirmed = verdictCache.get(processId);
            if (confirmed === undefined) {
                const verdict = await this.pot.getVerdict(processId);
                confirmed = verdict?.verified === 1;
                verdictCache.set(processId, confirmed);
            }
            if (!confirmed) {
                continue;
            }
            const weight = await this.nodes.currentWeight(nodeId);
            weights.set(nodeId, (weights.get(nodeId) ?? 0) + weight);
        }
        return weights;
    }

    /** Fetch the open epoch, creating its row (status 'open') on first accrual. */
    private async openEpoch(epochNumber: number): Promise<Epoch> {
        const existing = await this.repo.findOne({ where: { epochNumber } });
        if (existing) {
            return existing;
        }
        return this.repo.create({
            epochNumber,
            startTime: this.clock.now(),
            endTime: 0,
            totalFees: 0,
            distributionLog: [],
            status: 'open',
            operationalMargin: 0,
        });
    }

    private async requireEpoch(epochNumber: number): Promise<Epoch> {
        const epoch = await this.repo.findOne({ where: { epochNumber } });
        if (!epoch) {
            throw new NotFoundException(`Epoch ${epochNumber} does not exist`);
        }
        return epoch;
    }

    private toResult(epoch: Epoch): FinalizeResult {
        const paid = epoch.distributionLog
            .filter((e) => e.reason !== REASON_AFC)
            .reduce((sum, e) => sum + e.amount, 0);
        const reconciled = Math.abs(paid + epoch.operationalMargin - epoch.totalFees) < RECONCILE_EPSILON;
        return {
            epochNumber: epoch.epochNumber,
            distributionLog: epoch.distributionLog,
            operationalMargin: epoch.operationalMargin,
            paid,
            totalFees: epoch.totalFees,
            reconciled,
        };
    }
}
