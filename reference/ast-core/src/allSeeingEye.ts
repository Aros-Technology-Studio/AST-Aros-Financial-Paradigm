// 3.10 — The All-Seeing Eye: passive meta-observer ("witness, not judge"); observe -> log -> compare -> signal
import { OversightLogEntry, IntegritySignal, SupplySnapshot } from './types.js';
import { sha256, now } from './util.js';

export class AllSeeingEye {
  private oversightLedger: OversightLogEntry[] = [];
  private signals: IntegritySignal[] = [];

  // observe: append a signed, hash-linked entry to the immutable oversight ledger (I-EYE-5)
  observe(layer: string, eventType: string, description: string) {
    const prevHash = this.oversightLedger.at(-1)?.hash ?? 'GENESIS';
    const ts = now();
    const hash = sha256(layer + eventType + description + prevHash + ts);
    this.oversightLedger.push({ eventType, layer, description, hash, prevHash, timestamp: ts });
  }

  // compare + signal: detect structural anomalies; one-way, non-binding (I-EYE-1/2) — never mutates state
  compareSupply(s: SupplySnapshot) {
    if (s.processBurned > s.processMinted) this.emit('alert', { pattern: 'TOK-202', desc: 'supply drift: burned > minted' });
    if (s.earnedRetained < 0) this.emit('alert', { pattern: 'TOK-203', desc: 'negative earned' });
  }
  private emit(type: IntegritySignal['type'], payload: Record<string, unknown>) {
    this.signals.push({ type, payload, timestamp: now() });
    this.observe('supervisory', 'integrity_signal', `${type}:${JSON.stringify(payload)}`);
  }

  ledger(): ReadonlyArray<OversightLogEntry> { return this.oversightLedger.slice(); }
  getSignals(): ReadonlyArray<IntegritySignal> { return this.signals.slice(); }
}
