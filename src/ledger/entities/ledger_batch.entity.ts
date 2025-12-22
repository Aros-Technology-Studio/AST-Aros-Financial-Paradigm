import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('blocks')
export class Block {
    @PrimaryColumn()
    block_id: string; // Hash of the block

    @Column()
    epoch_id: string;

    @Column('bigint')
    height: string;

    @Column()
    merkle_root: string;

    @Column()
    prev_block_hash: string;

    @CreateDateColumn()
    created_at: Date;
}
