import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GovernanceTokenBalanceEntity } from '../governance/entities/governance_token_balance.entity';
import { ProposalEntity } from '../governance/proposal.entity';

@Injectable()
export class SlashingService {
    private readonly logger = new Logger(SlashingService.name);

    constructor(
        @InjectRepository(GovernanceTokenBalanceEntity)
        private readonly tokenRepo: Repository<GovernanceTokenBalanceEntity>,
        @InjectRepository(ProposalEntity)
        private readonly proposalRepo: Repository<ProposalEntity>,
    ) { }

    /**
     * Handle Fraud Signals emitted by Active AI Agents (Module 12)
     */
    @OnEvent('agent.fraud.signal')
    async handleFraudSignal(payload: any) {
        this.logger.warn(`Received Fraud Signal: ${JSON.stringify(payload)}`);

        let userIdToSlash: string | null = null;
        let reason = payload.type;

        // Determine who to slash based on signal type
        if (payload.type === 'PROPOSAL_RISK') {
            // TargetID is Proposal ID
            const proposal = await this.proposalRepo.findOne({ where: { id: payload.targetId } });
            if (proposal) {
                userIdToSlash = proposal.proposerId;
                this.logger.log(`Identified Malicious Proposer: ${userIdToSlash}`);
            } else {
                this.logger.error(`Proposal ${payload.targetId} not found for slashing.`);
            }
        }
        // Add other fraud types here (e.g. VALIDATOR_DOUBLE_SIGN)

        if (userIdToSlash) {
            await this.executeSlashing(userIdToSlash, 100, reason); // Fixed penalty for now
        }
    }

    private async executeSlashing(userId: string, amount: number, reason: string) {
        const balance = await this.tokenRepo.findOne({ where: { userId } });

        if (!balance) {
            this.logger.warn(`User ${userId} has no governance balance to slash.`);
            return;
        }

        const currentStake = parseFloat(balance.stakedBalance);
        const penalty = Math.min(currentStake, amount);
        const newStake = currentStake - penalty;

        balance.stakedBalance = newStake.toFixed(18); // assuming 18 decimals

        // Impact Reputation
        balance.reputationScore = Math.max(0, balance.reputationScore - 10);

        await this.tokenRepo.save(balance);

        this.logger.warn(`SLASHED User ${userId}: -${penalty} Tokens. New Balance: ${balance.stakedBalance}. Reason: ${reason}`);
    }
}
