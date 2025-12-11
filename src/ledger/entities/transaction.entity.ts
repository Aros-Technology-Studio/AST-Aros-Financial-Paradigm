import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('transactions')
export class Transaction {
    @PrimaryColumn()
    tx_id: string; // SHA3-512 Hash

    @Column()
    sender: string; // AST Address

    @Column()
    recipient: string; // AST Address

    @Column('decimal', { precision: 20, scale: 9 })
    amount: string;

    @Column()
    asset: string; // "ARO" or other asset code

    @CreateDateColumn()
    timestamp: Date;

    @Column('float', { default: 1.0 })
    tx_weight: number;

    @Column({ default: 'normal' })
    priority: string;

    @Column({ nullable: true })
    prev_tx_ref: string; // For PoT linking

    @Column({ nullable: true })
    @Index()
    epoch_id: string;

    @Column({ default: 'pending' }) // pending, committed, rejected
    status: string;
}
