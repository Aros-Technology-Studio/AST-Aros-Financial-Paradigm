import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Validator } from './validator.entity';

export enum StakeState {
    PENDING = 'pending',
    ACTIVE = 'active',
    FROZEN = 'frozen',
    SLASHED = 'slashed',
    UNLOCKED = 'unlocked',
}

@Entity('stakes')
export class Stake {
    @PrimaryGeneratedColumn('uuid')
    stake_id: string;

    @Column()
    validator_id: string;

    @ManyToOne(() => Validator)
    @JoinColumn({ name: 'validator_id' })
    validator: Validator;

    @Column('decimal', { precision: 20, scale: 9 })
    amount: string;

    @Column({
        type: 'enum',
        enum: StakeState,
        default: StakeState.PENDING,
    })
    state: StakeState;

    @CreateDateColumn()
    created_at: Date;
}
