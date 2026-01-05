
import { Injectable, Logger } from '@nestjs/common';
import { NodeType, ConnectedNode, ExecutionSnapshot, Vote } from './consensus.types';
import { hashData } from '../processing/processing.utils';
import { ShardingManager } from './sharding.manager';
import { GossipSimulationService } from './gossip.simulation';

@Injectable()
export class NodeChainService {
    private readonly logger = new Logger(NodeChainService.name);

    // In-memory storage for prototype
    private nodes: Map<string, ConnectedNode> = new Map();
    private ledger: ExecutionSnapshot[] = [];
    private pendingVotes: Map<string, Vote[]> = new Map(); // snapshotHash -> Votes[]

    constructor(
        private readonly shardingManager: ShardingManager,
        private readonly gossipService: GossipSimulationService
    ) {
        // Initialize Genesis Snapshot
        this.initializeGenesisSnapshot();
    }

    /**
     * Registers a new node to the network.
     */
    registerNode(id: string, type: NodeType, ip: string): ConnectedNode {
        if (this.nodes.has(id)) {
            this.logger.warn(`Node ${id} already registered.`);
            return this.nodes.get(id);
        }

        const newNode: ConnectedNode = {
            id,
            type,
            ip,
            joinedAt: Date.now(),
            isActive: true,
            metrics: { uptime: 100, batchesProposed: 0, batchesValidated: 0, missedVotes: 0 }
        };

        this.nodes.set(id, newNode);
        this.logger.log(`Node registered: ${id} (${type})`);
        return newNode;
    }

    /**
     * Returns all currently connected nodes.
     */
    getConnectedNodes(): ConnectedNode[] {
        return Array.from(this.nodes.values());
    }

    /**
     * Creates the Genesis Snapshot.
     */
    private initializeGenesisSnapshot() {
        const genesis: ExecutionSnapshot = {
            sequenceId: 0,
            previousSnapshotHash: '0',
            timestamp: Date.now(),
            tasks: [],
            validatorId: 'GENESIS',
            hash: hashData('GENESIS_SNAPSHOT'),
            votes: [],
            status: 'FINALIZED'
        };
        this.ledger.push(genesis);
        this.logger.log('Genesis Snapshot created.');
    }

    /**
     * Processes a proposed snapshot from a validator.
     * Simulates PoT validation and voting.
     */
    async processProposedSnapshot(snapshot: ExecutionSnapshot): Promise<ExecutionSnapshot> {
        this.logger.log(`Processing proposed snapshot #${snapshot.sequenceId} from ${snapshot.validatorId}`);

        // 1. Basic Validation
        const lastSnapshot = this.ledger[this.ledger.length - 1];
        if (snapshot.sequenceId !== lastSnapshot.sequenceId + 1) {
            throw new Error('Invalid snapshot sequence');
        }
        if (snapshot.previousSnapshotHash !== lastSnapshot.hash) {
            throw new Error('Invalid previous hash');
        }

        // 2. Simulate Voting (Quorum)
        // In a real system, we'd wait for async network votes. 
        // Here we simulate connected validators voting 'true'.
        const validators = Array.from(this.nodes.values()).filter(n => n.type === NodeType.VALIDATOR);
        const requiredVotes = Math.ceil(validators.length * 0.67);

        // Auto-vote pass for simulation if we have validators, else just generic pass
        if (validators.length > 0) {
            // Collect simulated votes
            // In a real flow, this would be asynchronous via gossip
        }

        // 3. Mark finalized & Gossip
        snapshot.status = 'FINALIZED';
        this.ledger.push(snapshot);

        // this.gossipService.broadcastSnapshotProposal(snapshot); // Update method name in gossip too

        this.logger.log(`Snapshot #${snapshot.sequenceId} FINALIZED. Ledger height: ${this.ledger.length}`);

        return snapshot;
    }

    /**
     * Submits a vote for a block.
     */
    submitVote(vote: Vote) {
        // Verify voter is a valid validator
        const node = this.nodes.get(vote.voterId);
        if (!node || node.type !== NodeType.VALIDATOR) {
            throw new Error('Unauthorized voter');
        }

        let votes = this.pendingVotes.get(vote.snapshotHash) || [];
        votes.push(vote);
        this.pendingVotes.set(vote.snapshotHash, votes);

        // Check if quorum reached (logic would be triggered here)
    }

    getLedgerHeight(): number {
        return this.ledger.length;
    }

    getLatestSnapshot(): ExecutionSnapshot {
        return this.ledger[this.ledger.length - 1];
    }
}
