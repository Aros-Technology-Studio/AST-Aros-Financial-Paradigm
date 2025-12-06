import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('shards')
export class ShardEntity {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column()
    shardIdentifier: string;

    @Column('jsonb', { default: [] })
    assignedNodes: string[];

    @Column({ default: true })
    isActive: boolean;
}
