// 3.2 / IX — NodeChain: append-only, hash-linked execution-and-registration chain (system of record)
import { ExecutionSnapshot } from './types.js';
import { sha256, now } from './util.js';

export class NodeChain {
  private _snapshots: ExecutionSnapshot[] = [];

  // recordState: append a snapshot, hash-linked to the previous (I-NC-1 append-only, I-NC-2 continuity)
  recordState(eventType: string, processId: string, data: Record<string, unknown>, validatorId: string | null): ExecutionSnapshot {
    const sequenceId = this._snapshots.length;
    const prevHash = sequenceId === 0 ? 'GENESIS' : this._snapshots[sequenceId - 1].hash;
    const ts = now();
    const payload = JSON.stringify({ sequenceId, eventType, processId, data });
    const hash = sha256(payload + prevHash + sequenceId);
    const snap: ExecutionSnapshot = {
      sequenceId, hash, prevHash, validatorId, status: 'confirmed',
      timestamp: ts, eventType, processId, data,
    };
    this._snapshots.push(snap);
    return snap;
  }

  get height(): number { return this._snapshots.length; }
  get head(): ExecutionSnapshot | null { return this._snapshots.at(-1) ?? null; }
  getSnapshots(): ReadonlyArray<ExecutionSnapshot> { return this._snapshots.slice(); }

  // reconstruct: recompute hashes from genesis; any tamper breaks the chain (I-NC-1, audit §9.4)
  reconstruct(): { ok: boolean; brokenAt: number | null } {
    for (let i = 0; i < this._snapshots.length; i++) {
      const s = this._snapshots[i];
      const prevHash = i === 0 ? 'GENESIS' : this._snapshots[i - 1].hash;
      const expected = sha256(JSON.stringify({ sequenceId: s.sequenceId, eventType: s.eventType, processId: s.processId, data: s.data }) + prevHash + s.sequenceId);
      if (s.prevHash !== prevHash || s.hash !== expected) return { ok: false, brokenAt: i };
    }
    return { ok: true, brokenAt: null };
  }
}
