import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('emission_events')
export class EmissionEventEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('decimal')
    amountMinted: number;

    @Column()
    reason: string; // e.g. 'epoch_reward'

    @Column()
    relatedConsensusEventId: string;

    @CreateDateColumn()
    createdAt: Date;
}
