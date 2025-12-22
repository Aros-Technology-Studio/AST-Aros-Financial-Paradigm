import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('distribution_logs')
export class DistributionLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    epochNumber: number;

    @Column('decimal')
    calculatedDistribution: number;

    @CreateDateColumn()
    loggedAt: Date;
}
