// AST Model 1 — shared types (derived from agent specs)
export type NodeType = 'validator' | 'router' | 'recorder';

export interface ProcessRequest {
  id: string;
  amount: number;        // transaction value of the process
  type: string;
  admissible: boolean;   // admissibility (admissible_context)
}

export type SnapshotStatus = 'created' | 'confirmed' | 'finalized';

export interface ExecutionSnapshot {
  sequenceId: number;
  hash: string;
  prevHash: string;
  validatorId: string | null;
  status: SnapshotStatus;
  timestamp: number;
  eventType: string;
  processId: string;
  data: Record<string, unknown>;
}

export interface NodeEntity {
  id: string;
  type: NodeType;
  metrics: { uptime: number; successes: number; total: number };
  status: 'active' | 'penalized' | 'disconnected';
  reputation: number;   // derived: successes/total * uptime
  weight: number;       // derived for task/share
  earned: number;       // earnedRetained (ArosCoin) — held by node (P6)
  // NOTE (Model 1): no stake / stakedBalance field exists by design (14.6)
}

export interface PoTVerdict {
  processId: string;
  verified: boolean;
  criteriaResult: Record<string, boolean>;
  linkedSnapshot: number;
  timestamp: number;
}

export interface SupplySnapshot {
  processMinted: number;
  processBurned: number;
  earnedRetained: number;
  timestamp: number;
}

export type SignalType = 'warning' | 'alert' | 'ping' | 'scope_violation';
export interface IntegritySignal { type: SignalType; payload: Record<string, unknown>; timestamp: number; }

export interface OversightLogEntry {
  eventType: string; layer: string; description: string;
  hash: string; prevHash: string; timestamp: number;
}
