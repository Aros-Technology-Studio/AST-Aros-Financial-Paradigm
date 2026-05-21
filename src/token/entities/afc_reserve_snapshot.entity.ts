import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('afc_reserve_snapshots')
@Index(['createdAt'])
export class AfcReserveSnapshotEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'decimal', precision: 30, scale: 8 })
    totalReserve: string;

    @Column({ type: 'decimal', precision: 20, scale: 10 })
    reserveIndex: string;

    @Column({ type: 'int' })
    transactionCount: number;

    @Column({ type: 'varchar', length: 128, nullable: true })
    triggerReferenceId: string;

    @CreateDateColumn()
    createdAt: Date;
}
