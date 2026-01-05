import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('epochs')
export class EpochEntity {
    [x: string]: string;
    @PrimaryGeneratedColumn('increment')
    epochNumber: number;

    @CreateDateColumn()
    startTime: Date;

    @Column({ nullable: true })
    endTime: Date;

    @Column('boolean', { default: false })
    isFinalized: boolean;
}
