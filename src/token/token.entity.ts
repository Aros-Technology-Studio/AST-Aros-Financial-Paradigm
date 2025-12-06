import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('token_transactions')
export class TokenTransactionEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    fromAddress: string;

    @Column()
    toAddress: string;

    @Column('decimal')
    amount: number;

    @Column()
    type: string; // transfer, burn, mint

    @CreateDateColumn()
    timestamp: Date;
}
