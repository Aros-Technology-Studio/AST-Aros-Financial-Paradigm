import { Test, TestingModule } from '@nestjs/testing';
import { GovernanceService, ProposalImpactLevel } from './governance.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProposalEntity } from './proposal.entity';
import { VoteEntity } from './vote.entity';
import { NodeChainService } from '../nodechain_engine/nodechain.service';
import { NodeType } from '../nodechain_engine/consensus.types';
import { GovernanceRoleEntity } from './entities/governance_role.entity';
import { GovernanceTokenBalanceEntity } from './entities/governance_token_balance.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockProposalRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
};

const mockVoteRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
};

const mockNodeChainService = {
    getConnectedNodes: jest.fn(),
};

describe('GovernanceService', () => {
    let service: GovernanceService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GovernanceService,
                { provide: getRepositoryToken(ProposalEntity), useValue: mockProposalRepo },
                { provide: getRepositoryToken(VoteEntity), useValue: mockVoteRepo },
                { provide: NodeChainService, useValue: mockNodeChainService },
                { provide: getRepositoryToken(GovernanceRoleEntity), useValue: { findOne: jest.fn().mockResolvedValue({ isActive: true }) } },
                { provide: getRepositoryToken(GovernanceTokenBalanceEntity), useValue: { findOne: jest.fn().mockResolvedValue({ stakedBalance: '100' }) } },
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
            ],
        }).compile();

        service = module.get<GovernanceService>(GovernanceService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createProposal', () => {
        it('should create a proposal if user is a validator', async () => {
            mockNodeChainService.getConnectedNodes.mockResolvedValue([
                { id: 'VAL_1', type: NodeType.VALIDATOR }
            ]);
            mockProposalRepo.findOne.mockResolvedValue(null); // No active proposal
            mockProposalRepo.create.mockReturnValue({ id: 'PROP_1' });
            mockProposalRepo.save.mockResolvedValue({ id: 'PROP_1' });

            const result = await service.createProposal('Title', 'Desc', 'VAL_1', ProposalImpactLevel.LOW);
            expect(result).toEqual({ id: 'PROP_1' });
            expect(mockProposalRepo.save).toHaveBeenCalled();
        });

        it('should throw if user is not a validator', async () => {
            mockNodeChainService.getConnectedNodes.mockResolvedValue([
                { id: 'USER_1', type: NodeType.OBSERVER }
            ]);

            await expect(service.createProposal('Title', 'Desc', 'USER_1', ProposalImpactLevel.LOW))
                .rejects.toThrow(BadRequestException);
        });
    });

    describe('castVote', () => {
        it('should cast a vote successfully', async () => {
            mockProposalRepo.findOne.mockResolvedValue({ id: 'PROP_1', status: 'ACTIVE' });
            mockNodeChainService.getConnectedNodes.mockResolvedValue([
                { id: 'VAL_1', type: NodeType.VALIDATOR }
            ]);
            mockVoteRepo.findOne.mockResolvedValue(null); // Not voted yet
            mockVoteRepo.create.mockReturnValue({ id: 'VOTE_1', choice: 'YES' });
            mockVoteRepo.save.mockResolvedValue({ id: 'VOTE_1', choice: 'YES' });

            const result = await service.castVote('PROP_1', 'VAL_1', 'YES');
            expect(result.choice).toBe('YES');
        });

        it('should throw if already voted', async () => {
            mockProposalRepo.findOne.mockResolvedValue({ id: 'PROP_1', status: 'ACTIVE' });
            mockNodeChainService.getConnectedNodes.mockResolvedValue([
                { id: 'VAL_1', type: NodeType.VALIDATOR }
            ]);
            mockVoteRepo.findOne.mockResolvedValue({ id: 'EXISTING_VOTE' });

            await expect(service.castVote('PROP_1', 'VAL_1', 'YES'))
                .rejects.toThrow(BadRequestException);
        });
    });
});
