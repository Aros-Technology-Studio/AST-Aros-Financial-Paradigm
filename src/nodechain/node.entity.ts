import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('nodes')
export class NodeEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    publicKey: string;

    @Column({ default: 'active' })
    status: string; // active, slashed, jailed

    @Column('float', { default: 1.0 })
    reputationScore: number;

    @Column('float', { default: 0.0 })
    tvs: number;

    @CreateDateColumn()
    joinedAt: Date;
}
