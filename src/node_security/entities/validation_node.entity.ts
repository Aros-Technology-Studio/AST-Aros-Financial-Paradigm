import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ValidatorStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    SLASHED = 'slashed',
    EXITED = 'exited',
}

@Entity('validators')
export class Validator {
    @PrimaryColumn()
    validator_id: string; // Typically a hash or logical ID

    @Column()
    pubkey: string;

    @Column({
        type: 'enum',
        enum: ValidatorStatus,
        default: ValidatorStatus.PENDING,
    })
    status: ValidatorStatus;

    @Column('decimal', { precision: 20, scale: 9, default: '0' })
    stake_amount: string;

    @Column('float', { default: 1.0 })
    score: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
