import { Injectable } from '@nestjs/common';
import { NodeChainService } from '../nodechain/nodechain.service';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';

/**
 * The fixed set of event types that must be captured for a process before a PoT verdict
 * may be issued. Mirrors `REQUIRED_BEFORE_VERDICT` in
 * reference/ast-core/src/stateRecording.ts. Coverage = |captured ∩ required| / |required| must
 * reach 1 for the process to be considered complete (spec invariant I-SR-1, project I3).
 */
export const REQUIRED_BEFORE_VERDICT: readonly string[] = [
    'initiation',
    'task_assignment',
    'stage_transition',
    'execution_complete',
];

/**
 * Result of the per-process completeness check. `complete` is true when every required event
 * type has been captured; `missing` lists the required event types still outstanding.
 */
export interface CompletenessResult {
    complete: boolean;
    missing: string[];
}

/**
 * StateRecordingService — captures significant process events, guarantees completeness, and
 * submits each event to NodeChain unchanged. It is the only module that writes to NodeChain
 * on behalf of process events.
 *
 * Operations follow docs/specs/AST_StateRecording_AGENT_EN.md and mirror
 * reference/ast-core/src/stateRecording.ts:
 *   - `capture(processId, eventType, data, validatorId?)` — append-through to NodeChain,
 *     remember the captured event type for the process.
 *   - `capturedEvents(processId)` — set of event types captured for a process so far.
 *   - `checkCompleteness(processId)` — whether every required pre-verdict event is present.
 *
 * Determinism (invariant I4) is preserved by deferring all hashing and timestamping to
 * NodeChainService, which itself uses ClockService and `sha256` from `common/hash.util`.
 */
@Injectable()
export class StateRecordingService {
    private readonly captured = new Map<string, Set<string>>();

    constructor(private readonly chain: NodeChainService) { }

    /**
     * Capture one significant event for a process. The event is forwarded to
     * NodeChainService.append() exactly as supplied (I-SR-4 pass-through), and the event type
     * is recorded against the process so completeness can later be checked (I3, I-SR-1).
     *
     * The payload submitted to NodeChain is a canonical, key-sorted object containing the
     * process id, the caller's `data` body, and the optional validator id. Sorting the keys
     * keeps the hash reproducible across recordings of the same logical event, which is what
     * invariant I4 (deterministic execution) requires.
     */
    async capture(
        processId: string,
        eventType: string,
        data: Record<string, unknown> = {},
        validatorId: string | null = null,
    ): Promise<ExecutionSnapshot> {
        const payload = this.buildPayload(processId, data, validatorId);
        const snapshot = await this.chain.append(eventType, payload);

        if (!this.captured.has(processId)) {
            this.captured.set(processId, new Set<string>());
        }
        this.captured.get(processId)!.add(eventType);

        return snapshot;
    }

    /**
     * Alias for `capture`, matching the spec's `record(event)` operation. Returns the
     * persisted ExecutionSnapshot so callers can read its sequenceId, hash, or timestamp.
     */
    async record(
        processId: string,
        eventType: string,
        data: Record<string, unknown> = {},
        validatorId: string | null = null,
    ): Promise<ExecutionSnapshot> {
        return this.capture(processId, eventType, data, validatorId);
    }

    /**
     * Returns the set of event types captured so far for the given process. Reads are safe:
     * the returned set is a copy, so callers cannot mutate the internal index.
     */
    capturedEvents(processId: string): Set<string> {
        const current = this.captured.get(processId);
        return new Set(current ?? []);
    }

    /**
     * Completeness gate (I-SR-1, project I3): required pre-verdict events ⊆ captured events.
     * Returns `{ complete, missing }` so callers can decide whether the process may advance
     * to PoT verdict or must wait for more captures.
     */
    checkCompleteness(processId: string): CompletenessResult {
        const have = this.captured.get(processId) ?? new Set<string>();
        const missing = REQUIRED_BEFORE_VERDICT.filter((event) => !have.has(event));
        return { complete: missing.length === 0, missing };
    }

    /**
     * Build the canonical payload submitted to NodeChain. Keys are emitted in a fixed order
     * (`processId`, `data`, `validatorId`) so two recordings of the same logical event always
     * serialize to the same JSON string and therefore the same hash.
     */
    private buildPayload(
        processId: string,
        data: Record<string, unknown>,
        validatorId: string | null,
    ): Record<string, unknown> {
        return {
            processId,
            data: this.sortKeys(data),
            validatorId,
        };
    }

    /**
     * Returns a shallow copy of `value` whose own keys are sorted alphabetically. Used so that
     * the JSON serialization of the payload is stable regardless of the key order the caller
     * provided, supporting deterministic hash reproduction (invariant I4).
     */
    private sortKeys(value: Record<string, unknown>): Record<string, unknown> {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = value[key];
        }
        return sorted;
    }
}
