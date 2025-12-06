
/**
 * Role of a node in the Aros Network.
 * - VALIDATOR: Actively proposes/votes on blocks.
 * - OBSERVER: Audits chain state, does not vote.
 * - SHARD: Processes specific partition of the ledger.
 */
export enum NodeType {
    VALIDATOR = 'VALIDATOR',
    OBSERVER = 'OBSERVER',
    SHARD = 'SHARD',
}

/**
 * Represents a single vote in the consensus process.
 */
export interface Vote {
    voterId: string;
    blockHash: string;
    signature: string;
    timestamp: number;
    approved: boolean;
}

/**
 * Represents a Block in the NodeChain.
 */
export interface Block {
    index: number;
    previousHash: string;
    timestamp: number;
    transactions: any[]; // Replace 'any' with Transaction type when available
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
    blocksProposed: number;
    blocksValidated: number;
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
