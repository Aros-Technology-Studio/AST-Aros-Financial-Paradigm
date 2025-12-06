import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('emission_logs')
export class EmissionLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    epochNumber: number;

    @Column('decimal')
    calculatedEmission: number;

    @CreateDateColumn()
    loggedAt: Date;
}
