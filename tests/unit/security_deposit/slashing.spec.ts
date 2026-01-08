import { Test, TestingModule } from '@nestjs/testing';
import { SlashingService } from '../../../src/security_deposit/slashing.service';
import { GovernanceTokenBalanceEntity } from '../../../src/governance/entities/governance_token_balance.entity';
import { ProposalEntity } from '../../../src/governance/proposal.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('SlashingService', () => {
    let service: SlashingService;
    let tokenRepo: any;
    let proposalRepo: any;

    beforeEach(async () => {
        tokenRepo = {
            findOne: jest.fn(),
            save: jest.fn()
        };
        proposalRepo = {
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SlashingService,
                { provide: getRepositoryToken(GovernanceTokenBalanceEntity), useValue: tokenRepo },
                { provide: getRepositoryToken(ProposalEntity), useValue: proposalRepo }
            ],
        }).compile();

        service = module.get<SlashingService>(SlashingService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should slash user balance on fraud signal', async () => {
        const signal = { type: 'PROPOSAL_RISK', targetId: 'P1' };

        // Mock Proposal Lookup
        proposalRepo.findOne.mockResolvedValue({ id: 'P1', proposerId: 'USER_1' });

        // Mock User Balance
        const mockBalance = { userId: 'USER_1', stakedBalance: '500', reputationScore: '100.00' };
        tokenRepo.findOne.mockResolvedValue(mockBalance);

        await service.handleFraudSignal(signal);

        expect(tokenRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            stakedBalance: '400', // 500 - 100
            reputationScore: '90.00' // 100 - 10
        }));
    });
});
