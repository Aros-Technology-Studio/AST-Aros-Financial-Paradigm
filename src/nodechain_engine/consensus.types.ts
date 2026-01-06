
/**
 * Role of a node in the Aros Network.
 * - VALIDATOR: Actively proposes/votes on execution snapshots.
 * - OBSERVER: Audits ledger state, does not vote.
 * - SHARD: Processes specific partition of the task queue.
 */
export enum NodeType {
    VALIDATOR = 'VALIDATOR',
    OBSERVER = 'OBSERVER',
    SHARD = 'SHARD',
    MINER = "MINER",
}

/**
 * Represents a single vote in the PoT consensus process.
 */
export interface Vote {
    voterId: string;
    snapshotHash: string;
    signature: string;
    timestamp: number;
    approved: boolean;
}

/**
 * Represents a discrete Execution Snapshot (Task Batch) in the NodeChain.
 * Replaces the concept of a 'Batch'.
 */
export interface ExecutionSnapshot {
    sequenceId: number;
    previousSnapshotHash: string;
    timestamp: number;
    tasks: any[]; // List of executed tasks (formerly transactions)
    validatorId: string; // Proposer
    hash: string;
    votes: Vote[];
    status: 'PROPOSED' | 'FINALIZED' | 'REJECTED';
}

/**
 * Metrics tracked for a node's reputation.
 */
export interface NodeMetrics {
    uptime: number;
    batchesProposed: number;
    batchesValidated: number;
    missedVotes: number;
}

/**
 * In-memory representation of a connected Node.
 */
export interface ConnectedNode {
    id: string; // Public Key or UUID
    type: NodeType;
    ip: string;
    joinedAt: number;
    metrics: NodeMetrics;
    isActive: boolean;
}
