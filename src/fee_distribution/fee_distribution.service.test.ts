
import { Test, TestingModule } from '@nestjs/testing';
import { FeeDistributionService } from './fee_distribution.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EpochEntity } from './epoch.entity';
import { DistributionLogEntity } from './distribution_log.entity';
import { Transaction } from '../ledger/entities/transaction.entity';
import { PoTService } from '../proof_of_transaction_engine/pot.service';
import { TokenService } from '../token/token.service';
import { NodeChainService } from '../nodechain_engine/nodechain.service';
import { SmartContractIntegration } from '../integration/smart_contract.integration';
import { EmissionService } from '../token/emission.service';
import { DataSource } from 'typeorm';

describe('FeeDistributionService', () => {
    let service: FeeDistributionService;

    // Mock Repositories
    const mockEpochRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };

    const mockDistLogRepo = {
        create: jest.fn(),
    };

    const mockTransactionRepo = {
        createQueryBuilder: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockReturnValue({ sum: '100.00' }),
        })),
        save: jest.fn(),
    };

    const mockPoTService = {
        calculateNodeScore: jest.fn().mockReturnValue(10),
        calculateNormalizedWeights: jest.fn().mockReturnValue(new Map([['node1', 0.5], ['node2', 0.5]])),
    };

    const mockTokenService = {};

    const mockEmissionService = {
        updateAfcReserve: jest.fn(),
    };

    const mockNodeChainService = {
        getConnectedNodes: jest.fn().mockReturnValue([
            { id: 'node1', metrics: { uptime: 100, batchesValidated: 10, missedVotes: 0, batchesProposed: 2 } },
            { id: 'node2', metrics: { uptime: 100, batchesValidated: 10, missedVotes: 0, batchesProposed: 2 } }
        ]),
    };

    const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
            save: jest.fn(),
        },
    };

    const mockDataSource = {
        createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FeeDistributionService,
                { provide: getRepositoryToken(EpochEntity), useValue: mockEpochRepo },
                { provide: getRepositoryToken(DistributionLogEntity), useValue: mockDistLogRepo },
                { provide: getRepositoryToken(Transaction), useValue: mockTransactionRepo },
                { provide: PoTService, useValue: mockPoTService },
                { provide: TokenService, useValue: mockTokenService },
                { provide: NodeChainService, useValue: mockNodeChainService },
                { provide: SmartContractIntegration, useValue: { validateReserve: jest.fn().mockResolvedValue({ isValid: true, onChainSupply: 100 }) } },
                { provide: EmissionService, useValue: mockEmissionService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<FeeDistributionService>(FeeDistributionService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('startNewEpoch', () => {
        it('should create a new epoch if none exists', async () => {
            mockEpochRepo.findOne.mockResolvedValue(null);
            mockEpochRepo.create.mockReturnValue({ epochNumber: 1 });
            mockEpochRepo.save.mockResolvedValue({ epochNumber: 1, status: 'ACTIVE' });

            const result = await service.startNewEpoch(1);
            expect(result).toHaveProperty('epochNumber', 1);
            expect(mockEpochRepo.save).toHaveBeenCalled();
        });
    });

    describe('finalizeEpoch', () => {
        it('should distribute rewards if totalFees > 0', async () => {
            const epoch = { epochNumber: 1, startTime: new Date(), status: 'ACTIVE' };
            mockEpochRepo.findOne.mockResolvedValue(epoch);

            await service.finalizeEpoch(1);

            // Verify Total Fees calculation called
            expect(mockTransactionRepo.createQueryBuilder).toHaveBeenCalled();

            // Verify Node Scores calculated
            expect(mockPoTService.calculateNodeScore).toHaveBeenCalledTimes(2); // 2 nodes

            // Verify Distribution (DataSource Transaction)
            expect(mockDataSource.createQueryRunner).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        });
    });
});

