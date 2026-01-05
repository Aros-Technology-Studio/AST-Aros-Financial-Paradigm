import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { NodeType } from '../consensus.types';

@Entity('nodes')
export class NodeEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Column({ type: 'enum', enum: NodeType })
    type: NodeType;

    @Column({ nullable: true })
    ip: string;

    @CreateDateColumn()
    joinedAt: Date;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'jsonb', default: {} })
    metrics: {
        uptime: number;
        batchesProposed: number;
        batchesValidated: number;
        missedVotes: number;
    };
}
