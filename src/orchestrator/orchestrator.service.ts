import { Injectable } from '@nestjs/common';
import { AllSeeingEyeService } from '../all-seeing-eye/all-seeing-eye.service';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { CommissionService, Participation } from '../commission/commission.service';
import { EmissionService } from '../emission/emission.service';
import { NodeChainService } from '../nodechain/nodechain.service';
import { NodesService } from '../nodes/nodes.service';
import { PotService } from '../pot/pot.service';
import { ReleaseService } from '../release/release.service';
import { ReserveService } from '../reserve/reserve.service';
import { StateRecordingService } from '../state-recording/state-recording.service';
import { RunProcessDto } from './dto/run-process.dto';

/** Default node roster used when no explicit assignment is supplied, mirroring the reference. */
const DEFAULT_NODES: ReadonlyArray<{ id: string; type: string }> = [
    { id: 'node-1', type: 'validator' },
    { id: 'node-2', type: 'router' },
    { id: 'node-3', type: 'recorder' },
];

/** Default epoch a process fee accrues into when the caller does not name one. */
const DEFAULT_EPOCH = 1;

/** Maturity thresholds for the Release readiness check surfaced in metrics (read-only). */
const RELEASE_THRESHOLD = 0.5;
const RELEASE_VELOCITY_TARGET = 0.1;

/** The terminal outcome of a process run, returned to the controller and the caller. */
export interface RunProcessResult {
    processId: string;
    /** Binary value gate: 1 only when PoT confirmed the process; 0 otherwise. */
    verified: 0 | 1;
    /** Why the run did not produce value, when it did not. */
    reason?: 'inadmissible' | 'unverified';
    /** Process part minted then burned for a verified process; 0 otherwise (nets to 0). */
    minted: number;
    /** Operation fee accrued into the epoch pool for a verified process; 0 otherwise. */
    fee: number;
    /** Derived total supply after the run completes. */
    supplyAfter: number;
    /** Reserve capitalization index after the run (derived from confirmed volume). */
    reserveIndex: number;
    /** Node ids assigned to the process. */
    assignedNodes: string[];
    /** The event types recorded to NodeChain during this run, in order. */
    events: string[];
}

/** Snapshot of system-wide metrics, read from the services without mutating any state. */
export interface MetricsSnapshot {
    totalSupply: number;
    earnedRetained: number;
    reserveIndex: number;
    verifiedProcessCount: number;
    currentEpoch: number;
    epochPool: number;
    nodeChainLength: number;
    releaseActive: boolean;
}

/**
 * OrchestratorService — drives the full Model-1 process lifecycle end to end.
 *
 * It composes every feature module into the single loop described in the ontology and mirrors
 * `reference/ast-core/src/orchestrator.ts` step for step:
 *
 *   initiation -> admissibility -> node assignment -> execution -> PoT verify ->
 *   emission (mint then burn, net 0) -> fee accrual -> reserve update (derived) ->
 *   final record; the All-Seeing Eye observes passively throughout.
 *
 * Value exists only behind the PoT gate: emission and fee accrual run only when the verdict is
 * `verified === 1` (project I1/I2/P7). An inadmissible or unverified process records its
 * outcome and produces no value. Every significant event is recorded in NodeChain (I3), and
 * the Eye only observes, compares, and logs — it never changes state (I10).
 *
 * Spec: docs/specs/AST_Ontology_FULL_AGENT_EN.md
 * Reference: reference/ast-core/src/orchestrator.ts
 */
@Injectable()
export class OrchestratorService {
    constructor(
        private readonly recording: StateRecordingService,
        private readonly pot: PotService,
        private readonly emission: EmissionService,
        private readonly coin: ArosCoinService,
        private readonly commission: CommissionService,
        private readonly nodes: NodesService,
        private readonly reserve: ReserveService,
        private readonly release: ReleaseService,
        private readonly eye: AllSeeingEyeService,
        private readonly chain: NodeChainService,
    ) { }

    /**
     * Run one process through the entire lifecycle in the reference's exact order. Returns a
     * structured result describing the verdict, the value produced (or not), and the resulting
     * supply/reserve state. State outside NodeChain changes only behind the PoT gate.
     */
    async runProcess(input: RunProcessDto): Promise<RunProcessResult> {
        const { processId, amount } = input;
        const epoch = input.epoch ?? DEFAULT_EPOCH;
        const events: string[] = [];

        // Step 1 — initiation: the process enters the system of record; the Eye witnesses it.
        await this.recording.capture(processId, 'initiation', { amount });
        events.push('initiation');
        await this.eye.log('initiation', 'processing', `process ${processId} initiated (amount ${amount})`);

        // Step 2 — admissibility: an inadmissible process is rejected before any work is done.
        // No node is assigned, no value can arise, and the rejection is observed (I1/P7).
        if (!input.admissible) {
            await this.eye.log('anomaly_detected', 'processing', `process ${processId} inadmissible — rejected`);
            return this.terminate(processId, 0, 'inadmissible', 0, 0, [], events);
        }

        // Step 3 — node assignment: select the assigned nodes and record the assignment.
        const assignedNodes = await this.resolveAssignedNodes(input.nodeIds);
        await this.recording.capture(processId, 'task_assignment', { nodes: assignedNodes });
        events.push('task_assignment');
        await this.eye.log('task_assignment', 'processing', `assigned to ${assignedNodes.length} nodes`);

        // Step 4 — execution: advance through the execution stage to completion, and record the
        // confirmed work each assigned node performed (work refreshes reputation and weight).
        await this.recording.capture(processId, 'stage_transition', { stage: 'execute' });
        events.push('stage_transition');
        await this.recording.capture(processId, 'execution_complete', {});
        events.push('execution_complete');
        for (const nodeId of assignedNodes) {
            await this.nodes.recordExecution(nodeId, true);
        }

        // Step 5 — PoT verify: the deterministic verdict reads the recorded evidence and the
        // chain state. The verdict is itself recorded in NodeChain; the Eye observes it.
        const verdict = await this.pot.verify(processId);
        await this.recording.capture(processId, 'pot_verdict', { verified: verdict.verified });
        events.push('pot.verified', 'pot_verdict');
        await this.eye.log('pot_verdict', 'processing', `process ${processId} verified=${verdict.verified}`);

        if (verdict.verified !== 1) {
            // Unverified: no emission, no fee accrual, no payment (I1/I2/P7). Record the outcome.
            await this.recording.capture(processId, 'final_status', { status: 'rejected' });
            events.push('final_status');
            const reserveIndex = await this.reserve.reserveIndex();
            const supplyAfter = await this.coin.totalSupply();
            await this.eye.compareSupply(await this.coin.supplyView());
            return {
                processId,
                verified: 0,
                reason: 'unverified',
                minted: 0,
                fee: 0,
                supplyAfter,
                reserveIndex,
                assignedNodes,
                events,
            };
        }

        // Step 6 — emission: mint the process part behind the PoT gate. Burn follows
        // commission accrual to match the reference orchestrator's canonical order:
        // mint → commission.accrue → burn (I5/I-EM-3).
        const minted = await this.emission.mint(processId, amount);
        events.push('emission.minted');
        await this.recording.capture(processId, 'emission', { minted });
        events.push('emission');
        await this.eye.log('mint', 'token_management', `minted ${minted} for ${processId}`);

        // Step 7 — fee accrual: the operation fee is consolidated into the open epoch pool,
        // tagged with each assigned node's participation so payment is post-factum by weight.
        const fee = this.commission.computeFee(amount);
        const participants: Participation[] = assignedNodes.map((nodeId) => ({ processId, nodeId }));
        await this.commission.accrue(epoch, fee, participants);

        // Burn the process part after commission accrual (canonical reference order, I5/I-EM-3).
        const burned = await this.emission.burn(processId, minted);
        events.push('emission.burned');
        await this.eye.log('burn', 'token_management', `burned ${burned} for ${processId}`);

        // Step 8 — reserve update: the reserve index is derived solely from confirmed-work
        // volume (emission.minted events); AFC commission accruals are tracked separately as
        // an audit trail and do not feed the index (I-RS-1). Reading it reflects this run's
        // emission contribution.
        const reserveIndex = await this.reserve.reserveIndex();

        // Step 9 — final record: mark the process done; the Eye logs and compares supply.
        await this.recording.capture(processId, 'final_status', { status: 'done' });
        events.push('final_status');
        await this.eye.log('final_status', 'ledger_anchoring', `process ${processId} finalized`);
        await this.eye.compareSupply(await this.coin.supplyView());

        const supplyAfter = await this.coin.totalSupply();
        return {
            processId,
            verified: 1,
            minted,
            fee,
            supplyAfter,
            reserveIndex,
            assignedNodes,
            events,
        };
    }

    /**
     * Finalize an epoch: pay nodes post-factum by PoT-confirmed participation weight and
     * allocate the operational margin to AST. The Eye observes the distribution and supply.
     */
    async finalizeEpoch(epoch: number = DEFAULT_EPOCH) {
        const result = await this.commission.finalizeEpoch(epoch);
        await this.eye.log(
            'commission_distribution',
            'token_management',
            `epoch ${epoch}: paid ${result.paid}, margin ${result.operationalMargin}, reconciled=${result.reconciled}`,
        );
        await this.eye.compareSupply(await this.coin.supplyView());
        return result;
    }

    /**
     * Read the recorded PoT verdict for a process together with the NodeChain events recorded
     * for it. Read-only: it issues no verdict and records nothing.
     */
    async getProcess(processId: string): Promise<{
        processId: string;
        verdict: { verified: 0 | 1; reasons: string[] } | null;
        events: { eventType: string; sequenceId: number; timestamp: number }[];
    }> {
        const verdict = await this.pot.getVerdict(processId);
        const history = await this.chain.list();
        const events = history
            .filter((snap) => (snap.payload as Record<string, unknown>)['processId'] === processId)
            .map((snap) => ({
                eventType: snap.eventType,
                sequenceId: snap.sequenceId,
                timestamp: snap.timestamp,
            }));
        return {
            processId,
            verdict: verdict ? { verified: verdict.verified, reasons: verdict.reasons } : null,
            events,
        };
    }

    /**
     * Read-only metrics snapshot pulled from the services. Computes nothing that mutates state:
     * supply and reserve are derived from history, the verified count comes from PoT verdicts,
     * the pool from the open epoch, and the chain length from NodeChain.
     */
    async metrics(epoch: number = DEFAULT_EPOCH): Promise<MetricsSnapshot> {
        const [totalSupply, earnedRetained, reserveIndex, verdicts, epochRow, history, releaseActive] =
            await Promise.all([
                this.coin.totalSupply(),
                this.coin.retained(),
                this.reserve.reserveIndex(),
                this.pot.list(),
                this.commission.getEpoch(epoch),
                this.chain.list(),
                this.release.isActive(),
            ]);

        const verifiedProcessCount = verdicts.filter((v) => v.verified === 1).length;

        return {
            totalSupply,
            earnedRetained,
            reserveIndex,
            verifiedProcessCount,
            currentEpoch: epoch,
            epochPool: epochRow ? epochRow.totalFees : 0,
            nodeChainLength: history.length,
            releaseActive,
        };
    }

    /**
     * Resolve the node ids to assign. An explicit list is used as given; otherwise the active
     * nodes from the registry are used, registering the default roster on first run so a fresh
     * stack always has a workforce (mirroring the reference AST constructor).
     */
    private async resolveAssignedNodes(explicit?: string[]): Promise<string[]> {
        if (explicit && explicit.length > 0) {
            return explicit;
        }
        let registered = await this.nodes.list();
        if (registered.length === 0) {
            for (const node of DEFAULT_NODES) {
                await this.nodes.register(node.id, node.type);
            }
            registered = await this.nodes.list();
        }
        return registered.filter((node) => node.status === 'active').map((node) => node.id);
    }

    /** Build the terminal result for a run that produced no value. */
    private async terminate(
        processId: string,
        verified: 0 | 1,
        reason: 'inadmissible' | 'unverified',
        minted: number,
        fee: number,
        assignedNodes: string[],
        events: string[],
    ): Promise<RunProcessResult> {
        const reserveIndex = await this.reserve.reserveIndex();
        const supplyAfter = await this.coin.totalSupply();
        return { processId, verified, reason, minted, fee, supplyAfter, reserveIndex, assignedNodes, events };
    }

    /** Release maturity thresholds exposed for the read-only readiness probe. */
    get releaseThresholds(): { threshold: number; velocityTarget: number } {
        return { threshold: RELEASE_THRESHOLD, velocityTarget: RELEASE_VELOCITY_TARGET };
    }
}
