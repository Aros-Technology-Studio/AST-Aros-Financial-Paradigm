import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProposalEntity } from './proposal.entity';
import { VoteEntity } from './vote.entity';
import { GovernanceRoleEntity } from './governance_role.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([ProposalEntity, VoteEntity, GovernanceRoleEntity]),
    ],
    providers: [],
    exports: [],
})
export class GovernanceModule { }
