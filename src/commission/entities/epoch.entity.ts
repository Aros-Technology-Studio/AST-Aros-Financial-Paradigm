import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Keeps decimal/bigint money columns numeric at runtime. Postgres surfaces `bigint` and
 * `decimal` as strings via TypeORM; the transformer restores the exact numeric value so
 * reconciliation arithmetic (I7) operates on the same numbers the service produced.
 */
const numericTransformer = {
    to: (value: number): number => value,
    from: (value: string | number | null): number => (value === null ? null : Number(value)),
};

/** One entry of an epoch's distribution: which node received how much, and on what basis. */
export interface DistributionEntry {
    /** Recipient identifier: a node id, or 'AST' for the operational margin allocation. */
    nodeId: string;
    /** Amount paid to the recipient for this epoch. */
    amount: number;
    /** Positive basis for the payment (e.g. 'work_weight', 'operational_margin'). */
    reason: string;
}

/** Lifecycle of an epoch pool: collecting fees, settled, or retired from the active window. */
export type EpochStatus = 'open' | 'finalized' | 'archived';

/**
 * Epoch — the per-epoch operational pool record of Commission.
 *
 * An epoch accumulates operation fees while `open`, then on finalization distributes the
 * pool post-factum to nodes by PoT-confirmed participation weight and allocates the
 * operational margin to AST. The `distributionLog` captures the full settlement so it can be
 * recorded in NodeChain and reconciled: Σ(payments) + operationalMargin == totalFees (I7).
 *
 * Spec: docs/specs/AST_Commission_AGENT_EN.md (data_model.EpochEntity).
 * Reference: reference/ast-core/src/commission.ts.
 */
@Entity({ name: 'epochs' })
export class Epoch {
    /** Sequential epoch index; one pool per epoch. */
    @PrimaryColumn({ type: 'integer', name: 'epoch_number' })
    epochNumber!: number;

    /** Deterministic tick marking when the epoch opened. */
    @Column({ type: 'bigint', name: 'start_time', transformer: numericTransformer })
    startTime!: number;

    /** Deterministic tick marking when the epoch was finalized; 0 while open. */
    @Column({ type: 'bigint', name: 'end_time', transformer: numericTransformer, default: 0 })
    endTime!: number;

    /** Sum of fees accrued into this epoch's pool. */
    @Column({ type: 'decimal', name: 'total_fees', transformer: numericTransformer, default: 0 })
    totalFees!: number;

    /** Per-recipient settlement entries; portable JSON across SQLite tests and Postgres prod. */
    @Column({ type: 'simple-json', name: 'distribution_log', default: '[]' })
    distributionLog!: DistributionEntry[];

    /** Lifecycle marker; payment may occur only on the transition to 'finalized'. */
    @Column({ type: 'varchar', length: 16, name: 'status', default: 'open' })
    status!: EpochStatus;

    /** Operational margin allocated to AST on finalization. */
    @Column({ type: 'decimal', name: 'operational_margin', transformer: numericTransformer, default: 0 })
    operationalMargin!: number;
}
