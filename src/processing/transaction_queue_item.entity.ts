import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tx_queue')
export class TransactionQueueItemEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    rawTxData: string;

    @Column({ default: 'queued' })
    status: string; // queued, processing, completed, failed

    @Column('int', { default: 0 })
    priority: number;

    @CreateDateColumn()
    enqueuedAt: Date;
}
