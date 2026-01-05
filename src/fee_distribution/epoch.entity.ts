import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('epochs')
export class EpochEntity {
    @PrimaryColumn()
    epochNumber: number;

    @CreateDateColumn()
    startTime: Date;

    @Column({ nullable: true })
    endTime: Date;

    @Column({ default: 'ACTIVE' })
    status: string;

    @Column({ default: '0' })
    totalFeesCollected: string;

    @Column({ default: '0' })
    totalDistributed: string;

    @Column({ default: '0' })
    nodeCount: string;
}
