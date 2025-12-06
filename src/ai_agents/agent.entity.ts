import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ai_agents')
export class AgentEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    agentName: string;

    @Column()
    role: string; // observer, analyzer, trigger

    @Column({ default: 'active' })
    status: string;
}
