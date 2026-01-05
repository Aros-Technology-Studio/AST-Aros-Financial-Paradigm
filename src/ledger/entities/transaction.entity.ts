import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum TransactionType {
    MINT = 'MINT',
    BURN = 'BURN',
    TRANSFER = 'TRANSFER',
    FEE_DISTRIBUTION = 'FEE',
    VALIDATOR_REWARD = 'REWARD'
}

export enum TransactionStatus {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
    FAILED = 'FAILED',
    ROLLED_BACK = 'ROLLED_BACK'
}

@Entity('transactions')
@Index(['hash'], { unique: true })
@Index(['sender', 'nonce'], { unique: true })
@Index(['blockHeight'])
export class Transaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 66, nullable: false })
    hash: string;

    @Column({ type: 'varchar', length: 66, nullable: false })
    previousHash: string;

    @Column({ type: 'bigint', nullable: false })
    blockHeight: string;

    @Column({ type: 'enum', enum: TransactionType })
    type: TransactionType;

    @Column({ type: 'varchar', length: 42, nullable: false })
    sender: string;

    @Column({ type: 'varchar', length: 42, nullable: false })
    recipient: string;

    @Column({ type: 'decimal', precision: 24, scale: 8, default: '0' })
    amount: string;

    @Column({ type: 'decimal', precision: 18, scale: 8, default: '0' })
    fee: string;

    @Column({ type: 'varchar', length: 10, default: 'AROS' })
    currency: string;

    @Column({ type: 'int' })
    nonce: number;

    @Column({ type: 'text', nullable: true })
    signature: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: any;

    @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
    status: TransactionStatus;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    finalizedAt: Date;

    @Column({ type: 'text', nullable: true })
    errorMessage: string;
}
