import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum GovernanceRole {
    PROPOSAL_AUTHOR = 'PROPOSAL_AUTHOR',
    VOTER = 'VOTER',
    COUNCIL_MEMBER = 'COUNCIL_MEMBER',
    COMPLIANCE_GATE = 'COMPLIANCE_GATE',
    GOVERNANCE_ADMIN = 'GOVERNANCE_ADMIN',
    OBSERVER = 'OBSERVER'
}

@Entity('governance_roles_v2')
export class GovernanceRoleEntity {
    @PrimaryColumn()
    id: string; // "ROLE_USERID_ROLETYPE" composite key or just uuid? 
    // Let's use a composite concept but store normally.
    // Actually, one user can have multiple roles. 
    // So distinct row per user per role.

    @Column()
    userId: string; // Link to Node.id or Wallet Address

    @Column({
        type: 'varchar', // 'enum' can be tricky with postgres sometimes, varchar is safer for prod migration simulation
    })
    role: GovernanceRole;

    @Column({ nullable: true })
    grantedBy: string; // Admin who granted the role

    @CreateDateColumn()
    grantedAt: Date;

    @Column({ default: true })
    isActive: boolean;
}
