
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { GovernanceService, ProposalImpactLevel } from './governance.service';

@Controller('governance')
export class GovernanceController {
    constructor(private readonly governanceService: GovernanceService) { }

    @Post('proposals')
    async createProposal(@Body() body: { title: string; description: string; proposerId: string; impact?: ProposalImpactLevel }) {
        // Default to LOW impact if not specified
        const impact = body.impact || ProposalImpactLevel.LOW;
        return this.governanceService.createProposal(body.title, body.description, body.proposerId, impact);
    }

    @Get('proposals')
    async listProposals() {
        return this.governanceService.getProposals();
    }

    @Post('proposals/:id/vote')
    async vote(
        @Param('id') id: string,
        @Body() body: { voterId: string; choice: 'YES' | 'NO' }
    ) {
        return this.governanceService.castVote(id, body.voterId, body.choice);
    }

    @Get('proposals/:id/tally')
    async getTally(@Param('id') id: string) {
        return this.governanceService.tallyVotes(id);
    }
}
