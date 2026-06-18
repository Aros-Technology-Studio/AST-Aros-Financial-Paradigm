import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { ClockService } from '../common/clock.service';
import { NodeChainService } from '../nodechain/nodechain.service';
import { NodesService } from '../nodes/nodes.service';
import { PotService } from '../pot/pot.service';
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

/** Recipient label for the AFC reserve allocation. */
const MARGIN_RECIPIENT = 'AFC_RESERVE';

/**
 * CommissionService — the settlement controller of AST.
 *
 * Commission computes the operation fee, consolidates fees into a per-epoch operational
 * pool, and on epoch finalization distributes payment to nodes post-factum by their
 * PoT-confirmed participation weight, routing the AFC reserve share to the Reserve layer.
 * It mirrors `reference/ast-core/src/commission.ts`:
 *   - `computeFee(amount)`        = amount * feeRate (optionally scaled by an overload rate).
 *   - `accrue(epoch, fee, parts)` adds the fee to the open epoch pool and remembers which
 *                                 nodes participated in which process for that fee.
 *   - `finalizeEpoch(epoch)`      pays nodes proportionally to weight (75 %), allocates the
 *                                 AFC reserve share (25 %), and records the distribution in
 *                                 NodeChain. The AFC share is tracked by ReserveService via
 *                                 the `commission.epoch.finalized` event (spec `margin_to: Reserve`).
 *
 * Payment is strictly post-factum and gated by PoT: a participation counts toward weight only
 * when its process carries a verdict with `verified === 1` (spec I-CM-1/I-CM-2, project
 * P2/I2). Presence or readiness alone earns nothing — only confirmed work does (I-CM-5).
 * The pool reconciles to zero remainder: Σ(payments) + afcMargin == Σ(fees) per epoch
 * (project I7, spec I-CM-4). Distribution is deterministic for identical inputs (I4).
 *
 * Spec: docs/specs/AST_Commission_AGENT_EN.md
 * Reference: reference/ast-core/src/commission.ts
 */
@Injectable()
export class CommissionService {
    /** Fee fraction of the operation amount. */
    readonly feeRate = 0.01;

    /** Share of the epoch pool routed to the AFC reserve fund (canonical 75/25 split). */
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
     * sum each node's confirmed-participation weight, distribute the distributable pool
     * proportionally (`paymentToNode = (weight * distributable) / Σweights`), allocate the
     * operational margin to AST, record the distribution in NodeChain, and mark the epoch
     * finalized. The pool reconciles with no remainder (I7).
     */
    async finalizeEpoch(epochNumber: number): Promise<FinalizeResult> {
        const epoch = await this.requireEpoch(epochNumber);
        if (epoch.status !== 'open') {
            return this.toResult(epoch);
        }

        const confirmedWeights = await this.confirmedWeights(epochNumber);
        const totalWeight = [...confirmedWeights.values()].reduce((sum, w) => sum + w, 0);

        const total = epoch.totalFees;
        const distributable = total * (1 - this.marginRate);

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
                distributionLog.push({ nodeId, amount, reason: 'work_weight' });
            }
        }

        // The AFC reserve share (25 %) is the pool remainder after node payments. It is routed
        // to the Reserve layer via the `commission.epoch.finalized` NodeChain event (spec
        // `margin_to: Reserve`) and does not enter the ArosCoin earned-retained supply.
        const allocatedMargin = total - paid;
        distributionLog.push({
            nodeId: MARGIN_RECIPIENT,
            amount: allocatedMargin,
            reason: 'afc_reserve',
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
            .filter((e) => e.reason !== 'afc_reserve')
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
