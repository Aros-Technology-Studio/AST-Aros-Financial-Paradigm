import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('ledger_batches')
export class LedgerBatch {
    @PrimaryColumn()
    batch_id: string; // Hash of the batch

    @Column()
    epoch_id: string;

    @Column('bigint')
    height: string;

    @Column()
    merkle_root: string;

    @Column()
    prev_batch_hash: string;

    @CreateDateColumn()
    created_at: Date;
}
