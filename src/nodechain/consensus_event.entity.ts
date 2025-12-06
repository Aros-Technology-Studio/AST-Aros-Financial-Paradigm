import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('consensus_events')
export class ConsensusEventEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    blockHash: string;

    @Column()
    proposerNodeId: string;

    @Column('jsonb')
    signatures: string[];

    @CreateDateColumn()
    finalizedAt: Date;
}
