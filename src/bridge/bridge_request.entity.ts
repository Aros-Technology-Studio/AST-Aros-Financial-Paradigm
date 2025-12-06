import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bridge_requests')
export class BridgeRequestEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    sourceChain: string;

    @Column()
    targetChain: string;

    @Column()
    amount: string;

    @Column()
    requesterAddress: string;

    @Column({ default: 'pending' })
    status: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
