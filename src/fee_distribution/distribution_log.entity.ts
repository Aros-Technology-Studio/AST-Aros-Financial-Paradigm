import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { EpochEntity } from './epoch.entity';

@Entity('distribution_logs')
export class DistributionLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'epoch_number', type: 'int' })
    epochNumber: number;

    @Column()
    nodeId: string;

    @Column('decimal')
    amount: string;

    @Column('float') // Using float for weight
    weight: number;

    @Column('simple-json', { nullable: true })
    calculationData: any;

    @CreateDateColumn()
    loggedAt: Date;
}
