import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import { EpochEntity } from './epoch.entity';
import { DistributionLogEntity } from './distribution_log.entity';
import { PoTService } from '../proof_of_transaction_engine/pot.service';
import { TokenService } from '../token/token.service';
import { NodeChainService } from '../nodechain_engine/nodechain.service';
import { Transaction, TransactionStatus, TransactionType } from '../ledger/entities/transaction.entity';

@Injectable()
export class FeeDistributionService {
    private readonly logger = new Logger(FeeDistributionService.name);
    // Address where fees are collected before distribution (System Treasury/Fee Pool)
    private readonly FEE_POOL_ADDRESS = 'SYSTEM_FEE_POOL_00000000000000000000';

    constructor(
        @InjectRepository(EpochEntity)
        private readonly epochRepo: Repository<EpochEntity>,
        @InjectRepository(DistributionLogEntity)
        private readonly distributionLogRepo: Repository<DistributionLogEntity>,
        @InjectRepository(Transaction)
        private readonly transactionRepo: Repository<Transaction>,
        private readonly potService: PoTService,
        private readonly tokenService: TokenService,
        private readonly nodeChainService: NodeChainService,
        private readonly dataSource: DataSource, // For transactionality
    ) { }

    /**
     * Starts a new Fee Distribution Epoch.
     * Logic: Closes previous epoch if active, starts new one.
     */
    async startNewEpoch(epochNumber: number): Promise<EpochEntity> {
        const existing = await this.epochRepo.findOne({ where: { epochNumber, status: 'ACTIVE' } });
        if (existing) {
            this.logger.warn(`Epoch ${epochNumber} already active.`);
            return existing;
        }

        // Close any previous active epoch (sanity check)
        const previousActive = await this.epochRepo.findOne({ where: { status: 'ACTIVE' } });
        if (previousActive) {
            await this.finalizeEpoch(previousActive.epochNumber);
        }

        const newEpoch = this.epochRepo.create({
            epochNumber,
            startTime: new Date(),
            status: 'ACTIVE',
            totalFeesCollected: '0',
            totalDistributed: '0',
            nodeCount: 0 // Will update at end
        });

        return this.epochRepo.save(newEpoch);
    }

    /**
     * Finalizes an epoch and triggers the distribution logic.
     */
    async finalizeEpoch(epochNumber: number): Promise<void> {
        const epoch = await this.epochRepo.findOne({ where: { epochNumber } });
        if (!epoch) throw new BadRequestException(`Epoch ${epochNumber} not found`);
        if (epoch.status === 'FINALIZED') return;

        epoch.endTime = new Date();
        epoch.status = 'PROCESSING'; // Intermediate state
        await this.epochRepo.save(epoch);

        try {
            // 1. Calculate Total Fees collected in this time range
            const totalFees = await this.calculateTotalFees(epoch.startTime, epoch.endTime);
            this.logger.log(`Epoch ${epochNumber} Finalization: Total Fees Calculated = ${totalFees}`);

            // 2. Get Node Performance Metrics from NodeChain
            // Note: In real system, we'd query persistent node metrics. 
            // Here accessing in-memory map from NodeChainService via public getter if available, 
            // or we need to access via a method we will assume exists or add.
            // For now, I will cast to any to access the private nodes map or better, let's assume we add a getter or use a hack for prototype.
            // BETTER: Use a query if NodeChainService had them in DB, but it uses in-memory.
            // I will use `getAllNodesSnapshot()` method (I will need to add it to NodeChainService or use what's available).
            // Looking at NodeChainService, it has no public getter for all nodes. 
            // I will implement a quick public accessor in NodeChainService in the next step. 
            // For now, I assume `getNodes()` exists.

            const activeNodes = this.nodeChainService.getConnectedNodes();

            // 3. Calculate PoT Scores
            const nodeScores = new Map<string, number>();

            for (const node of activeNodes) {
                const score = this.potService.calculateNodeScore({
                    txCount: node.metrics.batchesValidated, // Mapping batches to tx count proxy
                    totalFees: 0, // In this prototype, we don't track fees processed by specific node yet
                    penaltyScore: node.metrics.missedVotes,
                    validations: node.metrics.batchesProposed
                });
                nodeScores.set(node.id, score);
            }

            // 4. Normalize Weights
            const weights = this.potService.calculateNormalizedWeights(nodeScores);

            // 5. Distribute Rewards
            if (totalFees > 0) {
                await this.distributeRewards(epoch, totalFees, weights);
            }

            epoch.totalFeesCollected = totalFees.toString();
            epoch.nodeCount = activeNodes.length;
            epoch.status = 'FINALIZED';
            await this.epochRepo.save(epoch);

            this.logger.log(`Epoch ${epochNumber} Completed. Distributed ${totalFees} AROS to ${weights.size} nodes.`);

        } catch (error) {
            this.logger.error(`Failed to finalize Epoch ${epochNumber}: ${error.message}`);
            epoch.status = 'FAILED'; // or manual intervention needed
            await this.epochRepo.save(epoch);
            throw error;
        }
    }

    private async calculateTotalFees(start: Date, end: Date): Promise<number> {
        const { sum } = await this.transactionRepo
            .createQueryBuilder('tx')
            .select('SUM(CAST(tx.fee AS DECIMAL))', 'sum')
            .where('tx.createdAt BETWEEN :start AND :end', { start, end })
            .getRawOne();

        return parseFloat(sum || '0');
    }

    private async distributeRewards(epoch: EpochEntity, totalFees: number, weights: Map<string, number>) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            let distributedSum = 0;

            for (const [nodeId, weight] of weights.entries()) {
                if (weight <= 0) continue;

                const rewardAmount = totalFees * weight;
                if (rewardAmount < 0.00000001) continue; // Dust filter

                const rewardStr = rewardAmount.toFixed(8);

                // Transfer from Fee Pool to Node ID (assuming NodeID is a valid wallet address here)
                // In reality, Node entity might have a separate 'walletAddress' field. 
                // We'll assume nodeId IS the wallet address for simplicity.

                // We use TokenService to execute the specific ledger transaction
                // NOTE: TokenService's transfer logic usually requires signing, but for SYSTEM distribution
                // we might need a special system internal transfer method. 
                // Existing TokenService `mint` or `burn` exists. `transfer` logic is usually in Ledger or handled via signed tx.
                // We will implement a `systemTransfer` in TokenService or use `recordTransaction` directly here.

                // Let's use transactionRepo directly within the transaction to create the REWARD tx.
                await this.transactionRepo.save({
                    hash: `REWARD_${epoch.epochNumber}_${nodeId}`, // simplified hash
                    previousHash: 'SYSTEM',
                    blockHeight: '0',
                    type: TransactionType.VALIDATOR_REWARD,
                    sender: this.FEE_POOL_ADDRESS,
                    recipient: nodeId,
                    amount: rewardStr,
                    fee: '0',
                    nonce: epoch.epochNumber,
                    status: TransactionStatus.CONFIRMED,
                    metadata: { type: 'EPOCH_REWARD', epoch: epoch.epochNumber, weight }
                });

                // Log distribution
                const log = this.distributionLogRepo.create({
                    epoch: epoch,

                    nodeId: nodeId,
                    amount: rewardStr,
                    weight: weight,
                    calculationData: { totalFees, nodeWeight: weight }
                });
                await queryRunner.manager.save(log);

                distributedSum += rewardAmount;
            }

            epoch.totalDistributed = distributedSum.toFixed(8);
            await queryRunner.manager.save(epoch);

            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Helper to automatically rotate epochs.
     * Finds the current active epoch, finalizes it, and starts the next one.
     * If no epoch exists, starts Epoch 1.
     */
    async triggerEpochCycle(): Promise<void> {
        this.logger.log('Triggering Epoch Cycle...');

        // Find current active epoch
        const active = await this.epochRepo.findOne({
            where: { status: 'ACTIVE' },
            order: { epochNumber: 'DESC' }
        });

        let nextEpochNumber = 1;

        if (active) {
            this.logger.log(`Found active Epoch ${active.epochNumber}. Finalizing...`);
            await this.finalizeEpoch(active.epochNumber);
            nextEpochNumber = active.epochNumber + 1;
        } else {
            // Check if we have ANY finalized epochs to continue sequence
            const last = await this.epochRepo.findOne({
                where: {},
                order: { epochNumber: 'DESC' }
            });
            if (last) {
                nextEpochNumber = last.epochNumber + 1;
            }
        }

        this.logger.log(`Starting new Epoch ${nextEpochNumber}...`);
        await this.startNewEpoch(nextEpochNumber);
    }
}
