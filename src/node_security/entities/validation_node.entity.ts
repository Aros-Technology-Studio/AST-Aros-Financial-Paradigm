import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum NodeStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    FORFEITED = 'forfeited',
    EXITED = 'exited',
}

@Entity('validation_nodes')
export class ValidationNode {
    @PrimaryColumn()
    node_id: string; // Typically a hash or logical ID

    @Column()
    pubkey: string;

    @Column({
        type: 'enum',
        enum: NodeStatus,
        default: NodeStatus.PENDING,
    })
    status: NodeStatus;

    @Column('decimal', { precision: 20, scale: 9, default: '0' })
    security_deposit_amount: string;

    @Column('float', { default: 1.0 })
    score: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
