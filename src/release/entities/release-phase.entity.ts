import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Keeps the deterministic numeric tick numeric across the Postgres `bigint` boundary,
 * which TypeORM otherwise surfaces as a string. Mirrors the NodeChain transformer.
 */
const numericBigintTransformer = {
    to: (value: number): number => value,
    from: (value: string | number | null): number | null => (value === null ? null : Number(value)),
};

/**
 * ReleasePhase — the single-row record of the maturity transition.
 *
 * Release activation is a one-time transition from internal-only circulation to broader
 * circulation. This row holds whether the phase is active and, once it is, the metrics that
 * satisfied the dual condition at activation time. The same activation is also appended to
 * NodeChain (`release.activated`), which is the observable system of record (spec I-RL-4);
 * this row is a queryable cache of the current phase state.
 *
 * Spec: docs/specs/AST_Release_AGENT_EN.md (operations.activate).
 */
@Entity({ name: 'release_phases' })
export class ReleasePhase {
    /** Fixed identifier of the single phase row. */
    static readonly PHASE_ID = 1;

    @PrimaryColumn({ type: 'integer', name: 'id' })
    id!: number;

    /** Whether broader circulation has been activated. Defaults to inactive (bounded, P7). */
    @Column({ type: 'boolean', name: 'active', default: false })
    active!: boolean;

    /** Deterministic tick from ClockService at activation; null while inactive. */
    @Column({ type: 'bigint', name: 'activated_at', nullable: true, transformer: numericBigintTransformer })
    activatedAt!: number | null;

    /** reserveIndex measured at activation; null while inactive. */
    @Column({ type: 'float', name: 'reserve_index_at_activation', nullable: true })
    reserveIndexAtActivation!: number | null;

    /** velocity measured at activation; null while inactive. */
    @Column({ type: 'float', name: 'velocity_at_activation', nullable: true })
    velocityAtActivation!: number | null;
}
