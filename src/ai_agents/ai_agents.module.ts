import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEntity } from './agent.entity';
import { AgentDecisionLogEntity } from './agent_decision_log.entity';
import { ValidatorBehaviorService } from './validator-behavior.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([AgentEntity, AgentDecisionLogEntity]),
    ],
    providers: [ValidatorBehaviorService],
    exports: [ValidatorBehaviorService],
})
export class AiAgentsModule { }
