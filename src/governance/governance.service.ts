
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProposalEntity } from './proposal.entity';
import { VoteEntity } from './vote.entity';
import { NodeChainService } from '../nodechain_engine/nodechain.service';
import { NodeType } from '../nodechain_engine/consensus.types';

@Injectable()
export class GovernanceService {
    private readonly logger = new Logger(GovernanceService.name);

    constructor(
        @InjectRepository(ProposalEntity)
        private readonly proposalRepo: Repository<ProposalEntity>,
        @InjectRepository(VoteEntity)
        private readonly voteRepo: Repository<VoteEntity>,
        private readonly nodeChainService: NodeChainService,
    ) { }

    async createProposal(title: string, description: string, proposerId: string): Promise<ProposalEntity> {
        // Validate proposer is a validator
        const nodes = await this.nodeChainService.getConnectedNodes();
        const proposer = nodes.find(n => n.id === proposerId && n.type === NodeType.VALIDATOR);

        if (!proposer) {
            throw new BadRequestException('Only active Validators can create proposals');
        }

        const proposal = this.proposalRepo.create({
            title,
            description,
            proposerId,
            status: 'ACTIVE'
        });
        return this.proposalRepo.save(proposal);
    }

    async castVote(proposalId: string, voterId: string, choice: 'YES' | 'NO'): Promise<VoteEntity> {
        const proposal = await this.proposalRepo.findOne({ where: { id: proposalId } });
        if (!proposal) throw new NotFoundException('Proposal not found');
        if (proposal.status !== 'ACTIVE') throw new BadRequestException('Proposal is not active');

        // Validate voter
        const nodes = await this.nodeChainService.getConnectedNodes();
        const voter = nodes.find(n => n.id === voterId && n.type === NodeType.VALIDATOR);
        if (!voter) throw new BadRequestException('Only active Validators can vote');

        // Check if already voted
        const existing = await this.voteRepo.findOne({ where: { proposalId, voterId } });
        if (existing) throw new BadRequestException('Already voted');

        const vote = this.voteRepo.create({
            proposalId,
            voterId,
            choice,
            weight: 1.0 // Simple 1-node-1-vote for now, or use reputation
        });

        this.logger.log(`Vote cast for proposal ${proposalId} by ${voterId}: ${choice}`);
        return this.voteRepo.save(vote);
    }

    async getProposals(): Promise<ProposalEntity[]> {
        return this.proposalRepo.find({ order: { createdAt: 'DESC' } });
    }

    async getProposalVotes(proposalId: string): Promise<VoteEntity[]> {
        return this.voteRepo.find({ where: { proposalId } });
    }

    async tallyVotes(proposalId: string): Promise<any> {
        const votes = await this.getProposalVotes(proposalId);
        const yes = votes.filter(v => v.choice === 'YES').length;
        const no = votes.filter(v => v.choice === 'NO').length;
        return { yes, no, total: votes.length };
    }
}
