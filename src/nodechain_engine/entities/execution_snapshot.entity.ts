import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('execution_snapshots')
@Index(['sequenceId'], { unique: true })
export class ExecutionSnapshotEntity {
    @PrimaryColumn()
    hash: string;

    @Column({ type: 'int' })
    sequenceId: number;

    @Column()
    previousSnapshotHash: string;

    @Column()
    validatorId: string;

    @Column({ type: 'bigint' })
    timestamp: number;

    @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
    totalVerifiedVolume: number;

    @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
    cumulativePotValue: number;

    // Storing tasks as JSON for now, can be relation if needed later
    @Column({ type: 'jsonb', array: false, default: [] })
    tasks: any[];

    @Column({ type: 'jsonb', array: false, default: [] })
    votes: any[];

    @Column({ default: 'PENDING' })
    status: string;

    @CreateDateColumn()
    createdAt: Date;
}
