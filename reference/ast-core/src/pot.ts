// 3.1 / X — Proof of Transaction: verify the fact of execution, issue binary verdict, gate emission (P1,P4)
import { ProcessRequest, PoTVerdict } from './types.js';
import { now } from './util.js';

export class PoT {
  private verdicts = new Map<string, PoTVerdict>();

  // verify: deterministic check of composite criteria (§4); idempotent per process (I-PoT-4)
  verify(p: ProcessRequest, captured: Set<string>, chainOk: boolean, linkedSnapshot: number): PoTVerdict {
    const existing = this.verdicts.get(p.id);
    if (existing) return existing; // one verdict per process

    const criteriaResult = {
      admissible_context: p.admissible === true,
      full_stage_sequence: ['initiation', 'task_assignment', 'stage_transition'].every(e => captured.has(e)),
      states_recorded_in_nodechain: chainOk && captured.size > 0,
      completion_per_rules: captured.has('execution_complete'),
    };
    const verified = Object.values(criteriaResult).every(Boolean);
    const verdict: PoTVerdict = { processId: p.id, verified, criteriaResult, linkedSnapshot, timestamp: now() };
    this.verdicts.set(p.id, verdict);
    return verdict;
  }

  // authorizeEmission: allowed iff verified == 1 (I-EM-2 gate)
  authorizeEmission(processId: string): boolean { return this.verdicts.get(processId)?.verified === true; }
  getVerdict(processId: string): PoTVerdict | undefined { return this.verdicts.get(processId); }
}
