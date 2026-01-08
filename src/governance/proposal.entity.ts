import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum ProposalImpactLevel {
    LOW = 'LOW',         // 10% Quorum
    MEDIUM = 'MEDIUM',   // 25% Quorum
    HIGH = 'HIGH',       // 40% Quorum
    CRITICAL = 'CRITICAL' // 60% Quorum
}

export enum ProposalActionType {
    PARAMETER_CHANGE = 'PARAMETER_CHANGE',
    ROLE_ASSIGNMENT = 'ROLE_ASSIGNMENT',
    FUND_ALLOCATION = 'FUND_ALLOCATION',
    SYSTEM_UPGRADE = 'SYSTEM_UPGRADE',
    FREEZE_PROTOCOL = 'FREEZE_PROTOCOL'
}

export enum ProposalStatus {
    DRAFT = 'DRAFT',
    ACTIVE = 'ACTIVE',
    PASSED = 'PASSED',
    REJECTED = 'REJECTED',
    FAILED_QUORUM = 'FAILED_QUORUM',
    VETOED = 'VETOED',
    EXECUTED = 'EXECUTED',
    CANCELLED = 'CANCELLED'
}

@Entity('proposals')
export class ProposalEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column('text')
    description: string;

    @Column()
    proposerId: string;

    @Column({ nullable: true })
    hash: string;

    @Column({
        type: 'varchar',
        default: ProposalStatus.ACTIVE // Defaulting to active for simple flow, but ideally DRAFT first
    })
    status: ProposalStatus;

    @Column({
        type: 'varchar',
        default: ProposalImpactLevel.LOW
    })
    impactLevel: ProposalImpactLevel;

    @Column({
        type: 'varchar',
        default: ProposalActionType.PARAMETER_CHANGE
    })
    actionType: ProposalActionType;

    @Column({ type: 'int', default: 0 })
    timelockWindow: number; // Snapshots delay

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    requiredQuorumPercent: number;

    @Column({ type: 'bigint', nullable: true })
    snapshotBatch: number; // The logic time (ledgerHeight or similar) when proposal went live related to snapshot

    @CreateDateColumn()
    createdAt: Date;
}
