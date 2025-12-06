
import { Injectable, Logger } from '@nestjs/common';
import { NodeType, ConnectedNode, Block, Vote } from './consensus.types';
import { hashData } from '../processing/processing.utils'; // Reusing shared utils

@Injectable()
export class NodeChainService {
    private readonly logger = new Logger(NodeChainService.name);

    // In-memory storage for prototype
    private nodes: Map<string, ConnectedNode> = new Map();
    private chain: Block[] = [];
    private pendingVotes: Map<string, Vote[]> = new Map(); // blockHash -> Votes[]

    constructor() {
        // Initialize Genesis Block
        this.createGenesisBlock();
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
            metrics: { uptime: 100, blocksProposed: 0, blocksValidated: 0, missedVotes: 0 }
        };

        this.nodes.set(id, newNode);
        this.logger.log(`Node registered: ${id} (${type})`);
        return newNode;
    }

    /**
     * Creates the Genesis Block.
     */
    private createGenesisBlock() {
        const genesis: Block = {
            index: 0,
            previousHash: '0',
            timestamp: Date.now(),
            transactions: [],
            validatorId: 'GENESIS',
            hash: hashData('GENESIS_BLOCK'),
            votes: [],
            status: 'FINALIZED'
        };
        this.chain.push(genesis);
        this.logger.log('Genesis Block created.');
    }

    /**
     * Processes a proposed block from a validator.
     * Simulates PoT validation and voting.
     */
    async processProposedBlock(block: Block): Promise<Block> {
        this.logger.log(`Processing proposed block #${block.index} from ${block.validatorId}`);

        // 1. Basic Validation
        const lastBlock = this.chain[this.chain.length - 1];
        if (block.index !== lastBlock.index + 1) {
            throw new Error('Invalid block index');
        }
        if (block.previousHash !== lastBlock.hash) {
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
        }

        // Mark finalized
        block.status = 'FINALIZED';
        this.chain.push(block);
        this.logger.log(`Block #${block.index} FINALIZED. Chain height: ${this.chain.length}`);

        return block;
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

        let votes = this.pendingVotes.get(vote.blockHash) || [];
        votes.push(vote);
        this.pendingVotes.set(vote.blockHash, votes);

        // Check if quorum reached (logic would be triggered here)
    }

    getChainHeight(): number {
        return this.chain.length;
    }

    getLatestBlock(): Block {
        return this.chain[this.chain.length - 1];
    }
}
