import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('supply_snapshots')
@Index(['createdAt'])
export class SupplySnapshot {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'decimal', precision: 24, scale: 8, nullable: false })
    circulatingSupply: string;

    @Column({ type: 'decimal', precision: 24, scale: 8, nullable: false })
    totalMinted: string;

    @Column({ type: 'decimal', precision: 24, scale: 8, nullable: false })
    totalBurned: string;

    @Column({ type: 'varchar', length: 66, nullable: true })
    triggerTransactionHash: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: any;

    @CreateDateColumn()
    createdAt: Date;
}
