import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Stores the deterministic numeric tick alongside Postgres' `bigint`, which TypeORM
 * surfaces as a string by default. The transformer keeps the runtime value numeric so
 * downstream comparisons see exactly the value ClockService produced.
 */
const numericBigintTransformer = {
    to: (value: number): number => value,
    from: (value: string | number | null): number => (value === null ? null : Number(value)),
};

/**
 * PoTVerdict — the persisted record of a single process verdict.
 *
 * One row exists per process (`processId` is the primary key), which encodes the spec
 * invariant I-PoT-4: a process carries exactly one verdict. `verified` is stored as an
 * integer flag in {0, 1} to match the spec's `verified ∈ {0,1}` formula and to keep the
 * value gate (I1) explicit. `reasons` lists the verification criteria that did not hold;
 * it is empty when `verified === 1`. `snapshotSequenceId` links the verdict to the
 * NodeChain snapshot in which it was recorded (I-PoT-5: a verdict is valid only when
 * recorded in NodeChain).
 *
 * Spec: docs/specs/AST_PoT_AGENT_EN.md (data_model.PoTVerdict).
 * Reference: reference/ast-core/src/pot.ts (PoTVerdict).
 */
@Entity({ name: 'pot_verdicts' })
export class PotVerdict {
    /** Identifier of the process this verdict belongs to. One verdict per process. */
    @PrimaryColumn({ type: 'varchar', length: 128, name: 'process_id' })
    processId!: string;

    /** Binary verdict flag in {0, 1}. Value and emission are authorized only when this is 1. */
    @Column({ type: 'integer', name: 'verified' })
    verified!: 0 | 1;

    /**
     * Verification criteria that did not hold for this process, by name. Empty on success.
     * `simple-json` is used for portability across the SQLite test driver and Postgres prod.
     */
    @Column({ type: 'simple-json', name: 'reasons' })
    reasons!: string[];

    /** Deterministic tick from ClockService.now() captured when the verdict was issued. */
    @Column({ type: 'bigint', name: 'timestamp', transformer: numericBigintTransformer })
    timestamp!: number;

    /** sequenceId of the NodeChain snapshot in which this verdict was recorded. */
    @Column({ type: 'integer', name: 'snapshot_sequence_id' })
    snapshotSequenceId!: number;
}
