import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClockService } from '../common/clock.service';
import { NodeChainService } from '../nodechain/nodechain.service';
import {
    REQUIRED_BEFORE_VERDICT,
    StateRecordingService,
} from '../state-recording/state-recording.service';
import { PotVerdict } from './entities/pot-verdict.entity';

/** Outcome of a verdict, as returned to callers. `verified` is the value/emission gate. */
export interface VerifyResult {
    verified: 0 | 1;
    reasons: string[];
    snapshotSequenceId: number;
}

/**
 * PoTService — the verdict engine of AST.
 *
 * PoT reads the execution events recorded for a process and issues a deterministic binary
 * verdict `verified ∈ {0,1}`. The verdict is the single gate between "done" and "valued":
 * downstream emission and node payment authorize only when `verified === 1` (project I1,
 * spec I-PoT-1).
 *
 * The composite criteria mirror reference/ast-core/src/pot.ts. There the verdict is built
 * from four criteria; this port sources the same four from the recorded evidence:
 *   - admissible_context        : the process entered recording (its `initiation` event exists);
 *   - full_stage_sequence       : `task_assignment` and `stage_transition` events exist;
 *   - states_recorded_in_nodechain: the chain reconstructs and at least one event is present;
 *   - completion_per_rules      : the `execution_complete` event exists.
 * Because every criterion is a function of recorded events and the chain state alone, an
 * identical captured-event set always yields an identical verdict (project I4, spec I-PoT-2).
 *
 * A verdict is recorded once per process (spec I-PoT-4): a second `verify()` for the same
 * process returns the stored verdict unchanged rather than re-confirming or re-minting.
 * Every verdict is written to NodeChain before it is considered valid (spec I-PoT-5).
 *
 * Spec: docs/specs/AST_PoT_AGENT_EN.md
 * Reference: reference/ast-core/src/pot.ts
 */
@Injectable()
export class PotService {
    constructor(
        @InjectRepository(PotVerdict)
        private readonly repo: Repository<PotVerdict>,
        private readonly chain: NodeChainService,
        private readonly stateRecording: StateRecordingService,
        private readonly clock: ClockService,
    ) { }

    /**
     * Issue (or return the existing) verdict for a process. Idempotent per process: if a
     * verdict already exists it is returned unchanged, so a process is confirmed exactly
     * once and emission can never be authorized twice off one process (spec I-PoT-4).
     *
     * On a first call the composite criteria are evaluated against the recorded events,
     * the verdict is recorded in NodeChain, and the row is persisted carrying the snapshot
     * sequenceId so the verdict is traceable to its on-chain record (spec I-PoT-5).
     */
    async verify(processId: string): Promise<VerifyResult> {
        const existing = await this.repo.findOne({ where: { processId } });
        if (existing) {
            return {
                verified: existing.verified,
                reasons: existing.reasons,
                snapshotSequenceId: existing.snapshotSequenceId,
            };
        }

        const captured = this.stateRecording.capturedEvents(processId);
        const chainOk = (await this.chain.reconstruct()).ok;

        const criteriaResult: Record<string, boolean> = {
            admissible_context: captured.has('initiation'),
            full_stage_sequence:
                captured.has('task_assignment') && captured.has('stage_transition'),
            states_recorded_in_nodechain: chainOk && captured.size > 0,
            completion_per_rules: captured.has('execution_complete'),
        };

        const verifiedFlag = Object.values(criteriaResult).every(Boolean);
        const verified: 0 | 1 = verifiedFlag ? 1 : 0;
        const reasons = this.failureReasons(criteriaResult, captured);

        const snapshot = await this.chain.append('pot.verified', {
            processId,
            verified,
            reasons,
        });

        const verdict = this.repo.create({
            processId,
            verified,
            reasons,
            timestamp: this.clock.now(),
            snapshotSequenceId: snapshot.sequenceId,
        });
        await this.repo.save(verdict);

        return { verified, reasons, snapshotSequenceId: snapshot.sequenceId };
    }

    /** Returns the recorded verdict for a process, or null when none has been issued. */
    async getVerdict(processId: string): Promise<PotVerdict | null> {
        return this.repo.findOne({ where: { processId } });
    }

    /** Returns every recorded verdict. */
    async list(): Promise<PotVerdict[]> {
        return this.repo.find();
    }

    /**
     * Build the list of failure reasons for an unverified process. When the verdict fails
     * because required execution events were never recorded, those event types are named
     * directly; any remaining failed criterion is named by its criterion key. The list is
     * empty when every criterion holds.
     */
    private failureReasons(
        criteriaResult: Record<string, boolean>,
        captured: Set<string>,
    ): string[] {
        const reasons: string[] = [];

        const missingEvents = REQUIRED_BEFORE_VERDICT.filter((event) => !captured.has(event));
        for (const event of missingEvents) {
            reasons.push(`missing_event:${event}`);
        }

        // Surface any failed criterion that is not already explained by a missing event,
        // e.g. a chain that did not reconstruct cleanly.
        if (!criteriaResult.states_recorded_in_nodechain && captured.size > 0) {
            reasons.push('states_recorded_in_nodechain');
        }

        return reasons;
    }
}
