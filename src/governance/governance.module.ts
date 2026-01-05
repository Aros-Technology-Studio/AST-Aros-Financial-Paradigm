import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { ProposalEntity } from './proposal.entity';
import { VoteEntity } from './vote.entity';
import { NodeChainEngineModule } from '../nodechain_engine/nodechain_engine.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([ProposalEntity, VoteEntity]),
        NodeChainEngineModule
    ],
    controllers: [GovernanceController],
    providers: [GovernanceService],
    exports: [GovernanceService]
})
export class GovernanceModule { }
