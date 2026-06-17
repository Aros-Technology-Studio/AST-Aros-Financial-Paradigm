// 3.6 — State Recording: capture significant events, guarantee completeness, feed NodeChain (P3)
import { NodeChain } from './nodechain.js';

const REQUIRED_BEFORE_VERDICT = ['initiation', 'task_assignment', 'stage_transition', 'execution_complete'];

export class StateRecording {
  private captured = new Map<string, Set<string>>();
  constructor(private chain: NodeChain) {}

  // capture an event and submit it to NodeChain unchanged (I-SR-4)
  capture(processId: string, eventType: string, data: Record<string, unknown>, validatorId: string | null = null) {
    this.chain.recordState(eventType, processId, data, validatorId);
    if (!this.captured.has(processId)) this.captured.set(processId, new Set());
    this.captured.get(processId)!.add(eventType);
  }

  capturedEvents(processId: string): Set<string> { return this.captured.get(processId) ?? new Set(); }

  // completeness: required ⊆ captured (I-SR-1)
  checkCompleteness(processId: string): { complete: boolean; missing: string[] } {
    const have = this.capturedEvents(processId);
    const missing = REQUIRED_BEFORE_VERDICT.filter(e => !have.has(e));
    return { complete: missing.length === 0, missing };
  }
}
