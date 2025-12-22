import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('distribution_events')
export class DistributionEventEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('decimal')
    amountDistributed: number;

    @Column()
    reason: string; // e.g. 'epoch_payment'

    @Column()
    relatedConsensusEventId: string;

    @CreateDateColumn()
    createdAt: Date;
}
