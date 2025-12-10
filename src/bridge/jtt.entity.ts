import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('jtt_token')
export class JttEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    jurisdiction: string; // e.g., 'US', 'EU', 'SG'

    @Column()
    issuer: string; // Authority issuing the trust token

    @Column()
    validUntil: Date;

    @Column({ default: true })
    isValid: boolean;

    @CreateDateColumn()
    issuedAt: Date;
}
