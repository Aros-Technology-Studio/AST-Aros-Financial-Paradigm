import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlashingService } from './slashing.service';
import { GovernanceTokenBalanceEntity } from '../governance/entities/governance_token_balance.entity';
import { ProposalEntity } from '../governance/proposal.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            GovernanceTokenBalanceEntity,
            ProposalEntity
        ])
    ],
    providers: [SlashingService],
    exports: [SlashingService]
})
export class SecurityDepositModule { }
