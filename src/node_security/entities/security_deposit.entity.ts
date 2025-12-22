import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ValidationNode } from './validation_node.entity';

export enum SecurityDepositState {
    PENDING = 'pending',
    ACTIVE = 'active',
    LOCKED = 'locked',
    FORFEITED = 'forfeited',
    UNLOCKED = 'unlocked',
}

@Entity('security_deposits')
export class SecurityDeposit {
    @PrimaryGeneratedColumn('uuid')
    deposit_id: string;

    @Column()
    node_id: string;

    @ManyToOne(() => ValidationNode)
    @JoinColumn({ name: 'node_id' })
    node: ValidationNode;

    @Column('decimal', { precision: 20, scale: 9 })
    amount: string;

    @Column({
        type: 'enum',
        enum: SecurityDepositState,
        default: SecurityDepositState.PENDING,
    })
    state: SecurityDepositState;

    @CreateDateColumn()
    created_at: Date;
}
