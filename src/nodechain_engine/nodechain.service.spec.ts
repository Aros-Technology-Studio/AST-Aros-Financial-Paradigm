import { Test, TestingModule } from '@nestjs/testing';
import { NodeChainService } from './nodechain.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NodeEntity } from './entities/node.entity';
import { ExecutionSnapshotEntity } from './entities/execution_snapshot.entity';
import { ShardingManager } from './sharding.manager';
import { GossipSimulationService } from './gossip.simulation';
import { QuorumEngine } from './quorum.engine';
import { NodeType } from './consensus.types';

const mockQuorumEngine = {
    evaluate: jest.fn().mockReturnValue({ reached: true, approvedCount: 1, countThreshold: 1, approvedWeight: 1.0, weightThreshold: 0.67 }),
    computeCountThreshold: jest.fn().mockReturnValue(1),
    computeWeightThreshold: jest.fn().mockReturnValue(0.67),
};

const mockNodeRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
};

const mockSnapshotRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
};

const mockShardingManager = {};
const mockGossipService = {};

describe('NodeChainService', () => {
    let service: NodeChainService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NodeChainService,
                { provide: getRepositoryToken(NodeEntity), useValue: mockNodeRepo },
                { provide: getRepositoryToken(ExecutionSnapshotEntity), useValue: mockSnapshotRepo },
                { provide: ShardingManager, useValue: mockShardingManager },
                { provide: GossipSimulationService, useValue: mockGossipService },
                { provide: QuorumEngine, useValue: mockQuorumEngine },
            ],
        }).compile();

        service = module.get<NodeChainService>(NodeChainService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('registerNode', () => {
        it('should register a new node', async () => {
            mockNodeRepo.findOne.mockResolvedValue(null);
            mockNodeRepo.create.mockReturnValue({ id: 'NODE_1' });
            mockNodeRepo.save.mockResolvedValue({ id: 'NODE_1' });

            const result = await service.registerNode('NODE_1', NodeType.VALIDATOR, '127.0.0.1');
            expect(result).toEqual({ id: 'NODE_1' });
            expect(mockNodeRepo.save).toHaveBeenCalled();
        });

        it('should return existing node if already registered', async () => {
            mockNodeRepo.findOne.mockResolvedValue({ id: 'NODE_1', type: NodeType.VALIDATOR });

            const result = await service.registerNode('NODE_1', NodeType.VALIDATOR, '127.0.0.1');
            expect(result.id).toBe('NODE_1');
            expect(mockNodeRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('processProposedSnapshot', () => {
        it('should validate and finalize a snapshot', async () => {
            mockSnapshotRepo.findOne.mockResolvedValue({
                sequenceId: 0,
                hash: 'GENESIS_HASH'
            }); // Previous snapshot

            const proposedSnapshot: any = {
                sequenceId: 1,
                previousSnapshotHash: 'GENESIS_HASH',
                validatorId: 'VAL_1',
                tasks: [],
                hash: 'NEW_HASH',
                votes: [{ voterId: 'VAL_1', approved: true }],
            };

            // nodeRepo.find() returns active validators for BFT quorum check
            mockNodeRepo.find.mockResolvedValue([
                { id: 'VAL_1', nodeWeight: 1.0, type: NodeType.VALIDATOR, isActive: true },
            ]);
            mockSnapshotRepo.create.mockReturnValue({ ...proposedSnapshot, status: 'FINALIZED' });
            mockSnapshotRepo.save.mockResolvedValue({ ...proposedSnapshot, status: 'FINALIZED' });

            const result = await service.processProposedSnapshot(proposedSnapshot);

            expect(result.status).toBe('FINALIZED');
            expect(mockSnapshotRepo.save).toHaveBeenCalled();
        });

        it('should reject invalid sequence', async () => {
            mockSnapshotRepo.findOne.mockResolvedValue({
                sequenceId: 0,
                hash: 'GENESIS_HASH'
            });

            const proposedSnapshot: any = {
                sequenceId: 5, // Gap detected
                previousSnapshotHash: 'GENESIS_HASH'
            };

            await expect(service.processProposedSnapshot(proposedSnapshot))
                .rejects.toThrow('Invalid snapshot sequence');
        });
    });
});
