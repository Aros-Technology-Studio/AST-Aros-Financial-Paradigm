import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEntity } from './agent.entity';
import { AgentDecisionLogEntity } from './agent_decision_log.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([AgentEntity, AgentDecisionLogEntity]),
    ],
    providers: [],
    exports: [],
})
export class AiAgentsModule { }
