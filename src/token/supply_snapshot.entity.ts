import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('supply_snapshots')
export class SupplySnapshotEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('decimal')
    totalSupply: number;

    @Column('decimal')
    circulatingSupply: number;

    @Column('int')
    epochId: number;

    @CreateDateColumn()
    snapshotTime: Date;
}
