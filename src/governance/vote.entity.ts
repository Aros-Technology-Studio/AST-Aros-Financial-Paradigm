import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('votes')
export class VoteEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    proposalId: string;

    @Column()
    voterId: string;

    @Column()
    choice: string; // yes, no, abstain

    @Column('decimal')
    weight: number;

    @CreateDateColumn()
    castedAt: Date;
}
