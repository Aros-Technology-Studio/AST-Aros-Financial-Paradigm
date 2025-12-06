import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('governance_roles')
export class GovernanceRoleEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    roleName: string;

    @Column('jsonb')
    permissions: string[];
}
