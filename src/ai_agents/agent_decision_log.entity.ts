import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('agent_decision_logs')
export class AgentDecisionLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    agentId: string;

    @Column()
    decision: string;

    @Column('text')
    reasoning: string;

    @CreateDateColumn()
    timestamp: Date;
}
