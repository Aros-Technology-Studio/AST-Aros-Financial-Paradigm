import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('epochs')
export class EpochEntity {
    @PrimaryColumn({ type: 'int' })
    epochNumber: number;

    @CreateDateColumn()
    startTime: Date;

    @Column({ nullable: true })
    endTime: Date;

    @Column({ default: 'ACTIVE' })
    status: string;

    @Column('decimal', { precision: 18, scale: 8, default: '0' })
    totalFeesCollected: string;

    @Column('decimal', { precision: 18, scale: 8, default: '0' })
    totalDistributed: string;

    @Column('int', { default: 0 })
    nodeCount: number;
}
