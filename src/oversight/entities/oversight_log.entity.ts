import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('oversight_logs')
export class OversightLog {
    @PrimaryGeneratedColumn('uuid')
    log_id: string;

    @Column()
    source: string; // e.g. 'ast-node', 'validator-registry'

    @Column()
    event_type: string; // e.g. 'BLOCK_MINED'

    @Column('jsonb')
    payload: any;

    @CreateDateColumn()
    timestamp: Date;

    @Column()
    @Index({ unique: true })
    hash: string; // SHA3-512(prev_hash + payload + ...)

    @Column({ nullable: true })
    prev_hash: string; // Link to previous event
}
