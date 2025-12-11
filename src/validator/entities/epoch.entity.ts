import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum EpochStatus {
    ACTIVE = 'active',
    FINALIZED = 'finalized',
}

@Entity('epochs')
export class Epoch {
    @PrimaryGeneratedColumn('increment') // Or use a logical ID strategy
    epoch_id: number;

    @CreateDateColumn()
    start_time: Date;

    @Column({ nullable: true })
    end_time: Date;

    @Column({
        type: 'enum',
        enum: EpochStatus,
        default: EpochStatus.ACTIVE,
    })
    status: EpochStatus;

    @Column('decimal', { precision: 20, scale: 9, default: '0' })
    total_rewards: string;
}
