import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('meta_events')
@Index(['type'])
@Index(['anomalyId'])
export class MetaEventEntity {
    @PrimaryColumn('varchar')
    eventId: string;

    @Column({ type: 'bigint' })
    timestamp: number;

    @Column()
    type: string; // 'anomaly_detected' | 'heartbeat' | 'integrity_signal'

    @Column()
    source: string; // 'governance_layer' | 'token_management' | ...

    @Column({ nullable: true })
    anomalyId: string; // e.g., 'GOV-001'

    @Column({ type: 'jsonb', default: {} })
    payload: any;

    @Column({ nullable: true })
    signature: string;

    @CreateDateColumn()
    createdAt: Date;
}
