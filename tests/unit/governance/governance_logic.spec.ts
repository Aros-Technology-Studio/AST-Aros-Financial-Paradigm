import { Test, TestingModule } from '@nestjs/testing';
import { GovernanceService } from '../../../src/governance/governance.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProposalEntity, ProposalStatus, ProposalImpactLevel } from '../../../src/governance/proposal.entity';
import { VoteEntity } from '../../../src/governance/vote.entity';
import { GovernanceRoleEntity, GovernanceRole } from '../../../src/governance/entities/governance_role.entity';
import { GovernanceTokenBalanceEntity } from '../../../src/governance/entities/governance_token_balance.entity';
import { NodeChainService } from '../../../src/nodechain_engine/nodechain.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException } from '@nestjs/common';

describe('GovernanceService Refined Logic', () => {
    let service: GovernanceService;
    let proposalRepo: any;
    let roleRepo: any;
    let tokenRepo: any;
    let voteRepo: any;

    const mockProposerId = 'ProposerWin_01';
    const mockAdminId = 'AdminUser_01';

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GovernanceService,
                {
                    provide: getRepositoryToken(ProposalEntity),
                    useValue: {
                        findOne: jest.fn(),
                        create: jest.fn().mockImplementation(dto => dto),
                        save: jest.fn().mockImplementation(dto => Promise.resolve({ id: 'P-123', ...dto }))
                    }
                },
                {
                    provide: getRepositoryToken(VoteEntity),
                    useValue: {
                        findOne: jest.fn(),
                        create: jest.fn().mockImplementation(dto => dto),
                        save: jest.fn().mockImplementation(dto => Promise.resolve({ id: 'V-1', ...dto })),
                        find: jest.fn()
                    }
                },
                {
                    provide: getRepositoryToken(GovernanceRoleEntity),
                    useValue: {
                        findOne: jest.fn()
                    }
                },
                {
                    provide: getRepositoryToken(GovernanceTokenBalanceEntity),
                    useValue: {
                        findOne: jest.fn(),
                        find: jest.fn()
                    }
                },
                {
                    provide: NodeChainService,
                    useValue: {}
                },
                {
                    provide: EventEmitter2,
                    useValue: { emit: jest.fn() }
                }
            ],
        }).compile();

        service = module.get<GovernanceService>(GovernanceService);
        proposalRepo = module.get(getRepositoryToken(ProposalEntity));
        roleRepo = module.get(getRepositoryToken(GovernanceRoleEntity));
        voteRepo = module.get(getRepositoryToken(VoteEntity));
        tokenRepo = module.get(getRepositoryToken(GovernanceTokenBalanceEntity));
    });

    describe('createProposal', () => {
        it('should FAIL if user lacks PROPOSAL_AUTHOR role', async () => {
            roleRepo.findOne.mockResolvedValue(null); // No Role

            await expect(service.createProposal('Title', 'Desc', mockProposerId, ProposalImpactLevel.LOW))
                .rejects.toThrow(BadRequestException);
        });

        it('should SUCCEED if user has PROPOSAL_AUTHOR role', async () => {
            roleRepo.findOne.mockResolvedValue({ role: GovernanceRole.PROPOSAL_AUTHOR, isActive: true });
            proposalRepo.findOne.mockResolvedValue(null); // No active proposals

            const result = await service.createProposal('Title', 'Desc', mockProposerId, ProposalImpactLevel.HIGH);

            expect(result).toBeDefined();
            expect(result.requiredQuorumPercent).toBe(40); // High Impact = 40%
            expect(result.status).toBe(ProposalStatus.ACTIVE);
        });
    });

    describe('checkQuorum', () => {
        it('should return TRUE if participation exceeds threshold', async () => {
            // Setup Proposal: requires 10%
            proposalRepo.findOne.mockResolvedValue({
                id: 'P-123',
                requiredQuorumPercent: 10,
                status: ProposalStatus.ACTIVE
            });

            // Setup Votes: 200 Tokens voted YES
            voteRepo.find.mockResolvedValue([
                { choice: 'YES', weight: 200 }
            ]);

            // Setup System Stake: 1000 Total
            tokenRepo.find.mockResolvedValue([
                { stakedBalance: '500' },
                { stakedBalance: '500' }
            ]);

            // 200 / 1000 = 20% > 10%
            const isQuorum = await service.checkQuorum('P-123');
            expect(isQuorum).toBe(true);
        });

        it('should return FALSE if participation is below threshold', async () => {
            // Setup Proposal: requires 40%
            proposalRepo.findOne.mockResolvedValue({
                id: 'P-123',
                requiredQuorumPercent: 40,
                status: ProposalStatus.ACTIVE
            });

            // Setup Votes: 100 Tokens voted YES
            voteRepo.find.mockResolvedValue([
                { choice: 'YES', weight: 100 }
            ]);

            // Setup System Stake: 1000 Total
            tokenRepo.find.mockResolvedValue([
                { stakedBalance: '1000' }
            ]);

            // 100 / 1000 = 10% < 40%
            const isQuorum = await service.checkQuorum('P-123');
            expect(isQuorum).toBe(false);
        });
    });

    describe('emergencyFreeze', () => {
        it('should FAIL if caller is not Council/Admin', async () => {
            roleRepo.findOne.mockResolvedValue(null); // No Role

            await expect(service.freezeProposal('P-123', 'RandomUser'))
                .rejects.toThrow(BadRequestException);
        });

        it('should FREEZE proposal if caller is Council Member', async () => {
            roleRepo.findOne.mockResolvedValue({ role: GovernanceRole.COUNCIL_MEMBER, isActive: true });
            const mockProposal = { id: 'P-123', status: ProposalStatus.ACTIVE };
            proposalRepo.findOne.mockResolvedValue(mockProposal);

            await service.freezeProposal('P-123', mockAdminId);

            expect(proposalRepo.save).toHaveBeenCalledWith(expect.objectContaining({
                status: ProposalStatus.VETOED
            }));
        });
    });
});
