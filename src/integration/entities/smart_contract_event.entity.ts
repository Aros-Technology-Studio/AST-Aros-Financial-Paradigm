import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('smart_contract_events')
export class SmartContractEventEntity {
    @PrimaryColumn()
    transactionHash: string;

    @Column()
    method: string;

    @Column({ type: 'jsonb', default: {} })
    params: any;

    @Column({ default: 'SUCCESS' })
    status: string;

    @CreateDateColumn()
    timestamp: Date;
}
