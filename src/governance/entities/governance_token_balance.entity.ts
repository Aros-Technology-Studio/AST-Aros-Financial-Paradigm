import { Entity, PrimaryColumn, Column, UpdateDateColumn, CreateDateColumn } from 'typeorm';

@Entity('governance_token_balances')
export class GovernanceTokenBalanceEntity {
    @PrimaryColumn()
    userId: string; // Node.id or Wallet Address

    @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
    stakedBalance: string;

    @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
    delegatedBalance: string; // Tokens delegated TO this user

    @Column({ nullable: true })
    delegatedTo: string; // If this user delegated THEIR tokens to someone else

    @Column({ type: 'decimal', precision: 5, scale: 2, default: '1.00' })
    reputationScore: string; // Multiplier? For now just a score.

    @UpdateDateColumn()
    updatedAt: Date;
}
