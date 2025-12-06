import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    action: string;

    @Column()
    entityId: string;

    @Column('jsonb', { nullable: true })
    metadata: any;

    @CreateDateColumn()
    timestamp: Date;
}
