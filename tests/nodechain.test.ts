
import { Test, TestingModule } from '@nestjs/testing';
import { NodeChainService } from '../src/nodechain_engine/nodechain.service';
import { NodeType, Block } from '../src/nodechain_engine/consensus.types';
import { hashData } from '../src/processing/processing.utils';

import { ShardingManager } from '../src/nodechain_engine/sharding.manager';
import { GossipSimulationService } from '../src/nodechain_engine/gossip.simulation';

describe('NodeChainService', () => {
    let service: NodeChainService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NodeChainService,
                { provide: ShardingManager, useValue: {} }, // Mock ShardingManager
                { provide: GossipSimulationService, useValue: { broadcastBlockProposal: jest.fn() } }, // Mock GossipSimulationService
            ],
        }).compile();

        service = module.get<NodeChainService>(NodeChainService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should register a validator node', () => {
        const node = service.registerNode('val-1', NodeType.VALIDATOR, '127.0.0.1');
        expect(node).toBeDefined();
        expect(node.type).toBe(NodeType.VALIDATOR);
        expect(node.id).toBe('val-1');
    });

    it('should initialize with genesis block', () => {
        const height = service.getChainHeight();
        expect(height).toBe(1);
        const genesis = service.getLatestBlock();
        expect(genesis.index).toBe(0);
        expect(genesis.hash).toBe(hashData('GENESIS_BLOCK'));
    });

    it('should process a valid proposed block', async () => {
        // 1. Get current tip
        const previousBlock = service.getLatestBlock();

        // 2. Create new block
        const newBlock: Block = {
            index: previousBlock.index + 1,
            previousHash: previousBlock.hash,
            timestamp: Date.now(),
            transactions: [],
            validatorId: 'val-1',
            hash: hashData(`BLOCK_${previousBlock.index + 1}`),
            votes: [],
            status: 'PROPOSED'
        };

        // 3. Register validator to allow "simulated" Quorum check if implemented
        service.registerNode('val-1', NodeType.VALIDATOR, '127.0.0.1');

        // 4. Process
        const processed = await service.processProposedBlock(newBlock);

        expect(processed.status).toBe('FINALIZED');
        expect(service.getChainHeight()).toBe(2);
        expect(service.getLatestBlock().hash).toBe(newBlock.hash);
    });

    it('should reject block with invalid index', async () => {
        const previousBlock = service.getLatestBlock();
        const invalidBlock: Block = {
            index: previousBlock.index + 5, // Gap
            previousHash: previousBlock.hash,
            timestamp: Date.now(),
            transactions: [],
            validatorId: 'val-1',
            hash: 'invalid',
            votes: [],
            status: 'PROPOSED'
        };

        await expect(service.processProposedBlock(invalidBlock)).rejects.toThrow('Invalid block index');
    });
});
