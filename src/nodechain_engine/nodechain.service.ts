
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NodeType, ConnectedNode, ExecutionSnapshot, Vote } from './consensus.types';
import * as crypto from 'crypto';
import { ShardingManager } from './sharding.manager';
import { GossipSimulationService } from './gossip.simulation';
import { NodeEntity } from './entities/node.entity';
import { ExecutionSnapshotEntity } from './entities/execution_snapshot.entity';
import { QuorumEngine, WeightedVote } from './quorum.engine';

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
        private readonly gossipService: GossipSimulationService,
        private readonly quorumEngine: QuorumEngine,
    ) { }

    async onModuleInit() {
        await this.initializeGenesisSnapshot();
    }

    /**
     * Registers a new node to the network.
     */
    async registerNode(id: string, type: NodeType, ip: string, nodeWeight = 1.0): Promise<NodeEntity> {
        const existing = await this.nodeRepo.findOne({ where: { id } });
        if (existing) {
            this.logger.warn(`Node ${id} already registered.`);
            return existing;
        }

        const newNode = this.nodeRepo.create({
            id,
            type,
            ip,
            nodeWeight,
            joinedAt: new Date(),
            isActive: true,
            metrics: { uptime: 100, batchesProposed: 0, batchesValidated: 0, missedVotes: 0 }
        });

        await this.nodeRepo.save(newNode);
        this.logger.log(`Node registered: ${id} (${type}) weight=${nodeWeight}`);
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
            hash: crypto.createHash('sha256').update('GENESIS_SNAPSHOT').digest('hex'),
            votes: [],
            totalVerifiedVolume: 0,
            cumulativePotValue: 0,
            status: 'FINALIZED'
        });

        await this.snapshotRepo.save(genesis);
        this.logger.log('Genesis Snapshot created in DB.');
    }

    /**
     * Processes a proposed snapshot from a validator.
     * Performs real BFT quorum validation before finalization.
     */
    async processProposedSnapshot(snapshot: ExecutionSnapshot): Promise<ExecutionSnapshotEntity> {
        this.logger.log(`Processing proposed snapshot #${snapshot.sequenceId} from ${snapshot.validatorId}`);

        // 1. Basic chain validation
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

        // 2. Real BFT Quorum evaluation
        const activeValidators = await this.nodeRepo.find({
            where: { type: NodeType.VALIDATOR, isActive: true }
        });

        const totalValidatorCount = activeValidators.length;
        const totalValidatorWeight = activeValidators.reduce(
            (sum, n) => sum + (Number(n.nodeWeight) || 1),
            0,
        );

        // Build node weight lookup for fast access
        const weightMap = new Map<string, number>(
            activeValidators.map(n => [n.id, Number(n.nodeWeight) || 1])
        );

        // Merge votes: in-memory pending votes + votes already in the snapshot
        const pendingForHash = this.pendingVotes.get(snapshot.hash) ?? [];
        const allRawVotes: Vote[] = [...snapshot.votes, ...pendingForHash];

        // Deduplicate by voterId (last vote from each node wins)
        const voteMap = new Map<string, Vote>();
        for (const v of allRawVotes) {
            voteMap.set(v.voterId, v);
        }

        // Build WeightedVote list using authoritative DB weights (not self-reported)
        const weightedVotes: WeightedVote[] = [];
        for (const [voterId, vote] of voteMap.entries()) {
            const weight = weightMap.get(voterId);
            if (weight !== undefined) {
                // Only count votes from recognised active validators
                weightedVotes.push({ voterId, approved: vote.approved, nodeWeight: weight });
            }
        }

        const quorumResult = this.quorumEngine.evaluate(
            weightedVotes,
            totalValidatorCount,
            totalValidatorWeight,
        );

        this.logger.log(
            `Quorum result for snapshot #${snapshot.sequenceId}: ` +
            `approved=${quorumResult.approvedCount}/${quorumResult.countThreshold} (count), ` +
            `weight=${quorumResult.approvedWeight.toFixed(4)}/${quorumResult.weightThreshold.toFixed(4)} (weight), ` +
            `reached=${quorumResult.reached}`,
        );

        if (!quorumResult.reached) {
            const rejected = this.snapshotRepo.create({
                ...snapshot,
                totalVerifiedVolume: 0,
                cumulativePotValue: Number(lastSnapshot.cumulativePotValue || 0),
                status: 'REJECTED',
            });
            await this.snapshotRepo.save(rejected);
            throw new Error(
                `Quorum not reached for snapshot #${snapshot.sequenceId}. ` +
                `Need ${quorumResult.countThreshold} approvals (got ${quorumResult.approvedCount}) ` +
                `and weight ${quorumResult.weightThreshold.toFixed(4)} (got ${quorumResult.approvedWeight.toFixed(4)}).`,
            );
        }

        // Clear consumed pending votes
        this.pendingVotes.delete(snapshot.hash);

        // 3. Calculate Batch Volume and persist as FINALIZED
        const batchVolume = snapshot.tasks.reduce((sum, task) => sum + (Number(task.amount) || 0), 0);

        const newEntity = this.snapshotRepo.create({
            ...snapshot,
            totalVerifiedVolume: batchVolume,
            cumulativePotValue: Number(lastSnapshot.cumulativePotValue || 0) + batchVolume,
            status: 'FINALIZED'
        });

        await this.snapshotRepo.save(newEntity);

        this.logger.log(`Snapshot #${snapshot.sequenceId} FINALIZED. Ledger height: ${snapshot.sequenceId + 1}`);

        return newEntity;
    }

    /**
     * Submits a vote for a snapshot.
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
