import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('external_assets')
export class ExternalAssetEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    symbol: string;

    @Column()
    contractAddress: string;

    @Column()
    chain: string;

    @Column({ default: true })
    isWhitelisted: boolean;
}
