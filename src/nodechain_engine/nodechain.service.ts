
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NodeType, ConnectedNode, ExecutionSnapshot, Vote } from './consensus.types';
import { hashData } from '../processing/processing.utils';
import { ShardingManager } from './sharding.manager';
import { GossipSimulationService } from './gossip.simulation';
import { NodeEntity } from './entities/node.entity';
import { ExecutionSnapshotEntity } from './entities/execution_snapshot.entity';

@Injectable()
export class NodeChainService implements OnModuleInit {
    private readonly logger = new Logger(NodeChainService.name);

    // Pending votes can remain in memory for the prototype (mempool concept)
    private pendingVotes: Map<string, Vote[]> = new Map(); // snapshotHash -> Votes[]

    constructor(
        @InjectRepository(NodeEntity)
        private readonly nodeRepo: Repository<NodeEntity>,
        @InjectRepository(ExecutionSnapshotEntity)
        private readonly snapshotRepo: Repository<ExecutionSnapshotEntity>,
        private readonly shardingManager: ShardingManager,
        private readonly gossipService: GossipSimulationService
    ) { }

    async onModuleInit() {
        await this.initializeGenesisSnapshot();
    }

    /**
     * Registers a new node to the network.
     */
    async registerNode(id: string, type: NodeType, ip: string): Promise<NodeEntity> {
        const existing = await this.nodeRepo.findOne({ where: { id } });
        if (existing) {
            this.logger.warn(`Node ${id} already registered.`);
            return existing;
        }

        const newNode = this.nodeRepo.create({
            id,
            type,
            ip,
            joinedAt: Date.now(),
            isActive: true,
            metrics: { uptime: 100, batchesProposed: 0, batchesValidated: 0, missedVotes: 0 }
        });

        await this.nodeRepo.save(newNode);
        this.logger.log(`Node registered: ${id} (${type})`);
        return newNode;
    }

    /**
     * Returns all currently connected nodes.
     */
    async getConnectedNodes(): Promise<NodeEntity[]> {
        return this.nodeRepo.find({ where: { isActive: true } });
    }

    /**
     * Creates the Genesis Snapshot.
     */
    private async initializeGenesisSnapshot() {
        const count = await this.snapshotRepo.count();
        if (count > 0) {
            this.logger.log('Ledger already initialized.');
            return;
        }

        const genesis = this.snapshotRepo.create({
            sequenceId: 0,
            previousSnapshotHash: '0',
            timestamp: Date.now(),
            tasks: [],
            validatorId: 'GENESIS',
            hash: hashData('GENESIS_SNAPSHOT'),
            votes: [],
            status: 'FINALIZED'
        });

        await this.snapshotRepo.save(genesis);
        this.logger.log('Genesis Snapshot created in DB.');
    }

    /**
     * Processes a proposed snapshot from a validator.
     * Simulates PoT validation and voting.
     */
    async processProposedSnapshot(snapshot: ExecutionSnapshot): Promise<ExecutionSnapshotEntity> {
        this.logger.log(`Processing proposed snapshot #${snapshot.sequenceId} from ${snapshot.validatorId}`);

        // 1. Basic Validation
        // Fetch last snapshot from DB
        const lastSnapshot = await this.snapshotRepo.findOne({
            order: { sequenceId: 'DESC' }
        });

        if (!lastSnapshot) {
            throw new Error('Genesis not found! System corrupted.');
        }

        if (snapshot.sequenceId !== lastSnapshot.sequenceId + 1) {
            throw new Error(`Invalid snapshot sequence. Expected ${lastSnapshot.sequenceId + 1}, got ${snapshot.sequenceId}`);
        }
        if (snapshot.previousSnapshotHash !== lastSnapshot.hash) {
            throw new Error('Invalid previous hash');
        }

        // 2. Simulate Voting (Quorum)
        const validators = await this.nodeRepo.count({ where: { type: NodeType.VALIDATOR, isActive: true } });

        // Logic for voting simulation would go here...

        // 3. Mark finalized & Persist
        const newEntity = this.snapshotRepo.create({
            ...snapshot,
            status: 'FINALIZED'
        });

        await this.snapshotRepo.save(newEntity);

        this.logger.log(`Snapshot #${snapshot.sequenceId} FINALIZED. Ledger height: ${snapshot.sequenceId + 1}`);

        return newEntity;
    }

    /**
     * Submits a vote for a block.
     */
    async submitVote(vote: Vote) {
        // Verify voter is a valid validator
        const node = await this.nodeRepo.findOne({ where: { id: vote.voterId } });
        if (!node || node.type !== NodeType.VALIDATOR) {
            throw new Error('Unauthorized voter');
        }

        let votes = this.pendingVotes.get(vote.snapshotHash) || [];
        votes.push(vote);
        this.pendingVotes.set(vote.snapshotHash, votes);
    }

    async getLedgerHeight(): Promise<number> {
        return this.snapshotRepo.count();
    }

    async getLatestSnapshot(): Promise<ExecutionSnapshotEntity> {
        return this.snapshotRepo.findOne({
            order: { sequenceId: 'DESC' }
        });
    }
}
