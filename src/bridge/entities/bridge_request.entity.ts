import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, UpdateDateColumn } from 'typeorm';

export enum BridgeRequestType {
    DEPOSIT = 'DEPOSIT',       // BB -> AST (Mint)
    WITHDRAWAL = 'WITHDRAWAL'  // AST -> BB (Burn)
}

export enum BridgeRequestStatus {
    PENDING = 'PENDING',
    PROCESSED = 'PROCESSED',
    FAILED = 'FAILED',
    REJECTED = 'REJECTED'
}

@Entity('bridge_requests')
@Index(['externalReference'], { unique: true }) // ID транзакции в системе Банка (защита от дублей)
export class BridgeRequest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    externalReference: string; // ID операции на стороне Банка (BB)

    @Column({ type: 'enum', enum: BridgeRequestType })
    type: BridgeRequestType;

    @Column({ type: 'enum', enum: BridgeRequestStatus, default: BridgeRequestStatus.PENDING })
    status: BridgeRequestStatus;

    @Column({ type: 'decimal', precision: 24, scale: 8, nullable: false })
    amount: string;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    fiatCurrency: string;

    @Column({ type: 'varchar', length: 42, nullable: false })
    targetWallet: string; // Кошелек пользователя или адрес сжигания

    @Column({ type: 'jsonb', nullable: true })
    rawPayload: any; // Полный JSON, пришедший от Банка (для отладки)

    @Column({ type: 'text', nullable: true })
    processingError: string;

    @Column({ type: 'varchar', length: 66, nullable: true })
    relatedTxHash: string; // Хэш транзакции в NodeChain (Mint/Burn)

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
