import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

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

    @Column({ default: 'draft' })
    status: string;

    @CreateDateColumn()
    createdAt: Date;
}
