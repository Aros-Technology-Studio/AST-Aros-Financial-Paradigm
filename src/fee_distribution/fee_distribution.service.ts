import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import { EpochEntity } from './epoch.entity';
import { DistributionLogEntity } from './distribution_log.entity';
import { PoTService } from '../proof_of_transaction_engine/pot.service';
import { TokenService } from '../token/token.service';
import { NodeChainService } from '../nodechain_engine/nodechain.service';
import { Transaction, TransactionStatus, TransactionType } from '../ledger/entities/transaction.entity';

import { SmartContractIntegration } from '../integration/smart_contract.integration';
import { EmissionService } from '../token/emission.service';

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
        private readonly smartContractService: SmartContractIntegration,
        private readonly dataSource: DataSource, // For transactionality
        private readonly emissionService: EmissionService,
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

            const activeNodes = await this.nodeChainService.getConnectedNodes();

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
                // [NEW] Validate Reserve before distribution
                const { isValid, onChainSupply } = await this.smartContractService.validateReserve();
                if (!isValid) {
                    throw new Error(`Smart Contract Reserve Mismatch! On-Chain Supply: ${onChainSupply}`);
                }
                this.logger.log(`Smart Contract Reserve verified. Supply: ${onChainSupply}`);

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

    private readonly AFC_RESERVE_ADDRESS = 'SYSTEM_AFC_RESERVE_000000000000000000';

    // Canonical split ratios (75% nodes / 25% AFC reserve)
    private readonly NODE_SHARE_RATIO = 0.75;
    private readonly AFC_SHARE_RATIO  = 0.25;

    private async distributeRewards(epoch: EpochEntity, totalFees: number, weights: Map<string, number>) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Canonical 75/25 split of collected fees
            const nodePool   = totalFees * this.NODE_SHARE_RATIO;
            const afcReserve = totalFees * this.AFC_SHARE_RATIO;

            this.logger.log(
                `Epoch ${epoch.epochNumber}: total fees=${totalFees} ` +
                `→ node pool=${nodePool.toFixed(8)} (75%) | AFC reserve=${afcReserve.toFixed(8)} (25%)`,
            );

            // Record AFC reserve contribution
            await this.transactionRepo.save({
                hash:         `AFC_RESERVE_${epoch.epochNumber}`,
                previousHash: 'SYSTEM',
                ledgerHeight: '0',
                type:         TransactionType.FEE_DISTRIBUTION,
                sender:       this.FEE_POOL_ADDRESS,
                recipient:    this.AFC_RESERVE_ADDRESS,
                amount:       afcReserve.toFixed(8),
                fee:          '0',
                nonce:        epoch.epochNumber * 10000,
                status:       TransactionStatus.CONFIRMED,
                metadata:     { type: 'AFC_RESERVE_25PCT', epoch: epoch.epochNumber },
            });

            let distributedSum = 0;

            for (const [nodeId, weight] of weights.entries()) {
                if (weight <= 0) continue;

                const rewardAmount = nodePool * weight;
                if (rewardAmount < 0.00000001) continue; // dust filter

                const rewardStr = rewardAmount.toFixed(8);

                await this.transactionRepo.save({
                    hash:         `REWARD_${epoch.epochNumber}_${nodeId}`,
                    previousHash: 'SYSTEM',
                    ledgerHeight: '0',
                    type:         TransactionType.VALIDATOR_REWARD,
                    sender:       this.FEE_POOL_ADDRESS,
                    recipient:    nodeId,
                    amount:       rewardStr,
                    fee:          '0',
                    nonce:        epoch.epochNumber,
                    status:       TransactionStatus.CONFIRMED,
                    metadata:     { type: 'EPOCH_REWARD', epoch: epoch.epochNumber, weight },
                });

                const log = this.distributionLogRepo.create({
                    epochNumber:     epoch.epochNumber,
                    nodeId:          nodeId,
                    amount:          rewardStr,
                    weight:          weight,
                    calculationData: { totalFees, nodePool, nodeWeight: weight },
                });
                await queryRunner.manager.save(log);

                distributedSum += rewardAmount;
            }

            epoch.totalDistributed = (distributedSum + afcReserve).toFixed(8);
            await queryRunner.manager.save(epoch);

            await queryRunner.commitTransaction();

            // Sync AFC reserve index so per-TX emission price reflects epoch fees.
            this.emissionService.updateAfcReserve(afcReserve);
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

    async getEpoch(epochNumber: number): Promise<EpochEntity | null> {
        return this.epochRepo.findOne({ where: { epochNumber } });
    }

    async getCurrentEpoch(): Promise<EpochEntity | null> {
        return this.epochRepo.findOne({
            where: { status: 'ACTIVE' },
            order: { epochNumber: 'DESC' }
        });
    }
}
