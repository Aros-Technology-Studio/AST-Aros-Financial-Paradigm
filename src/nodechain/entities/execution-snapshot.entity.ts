import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Stores the deterministic numeric tick alongside Postgres' `bigint`, which TypeORM
 * surfaces as a string by default. The transformer keeps the runtime value numeric so
 * hash recomputation and sequencing logic see exactly the value ClockService produced.
 */
const numericBigintTransformer = {
    to: (value: number): number => value,
    from: (value: string | number | null): number => (value === null ? null : Number(value)),
};

/**
 * ExecutionSnapshot — the persisted unit of the NodeChain ledger.
 *
 * Every snapshot represents one significant event in the system's execution history.
 * Snapshots are linked through `prevHash`, forming a cryptographically continuous chain
 * (hash(n) = sha256(payloadJson || prevHash || sequenceId)). The monotonically increasing
 * `sequenceId` defines the canonical order of the chain, and `timestamp` carries the
 * deterministic tick from ClockService at which the snapshot was appended.
 *
 * Spec: docs/specs/AST_NodeChain_AGENT_EN.md (data_model.ExecutionSnapshot).
 */
@Entity({ name: 'execution_snapshots' })
@Index('uq_execution_snapshots_sequence_id', ['sequenceId'], { unique: true })
export class ExecutionSnapshot {
    /** Monotonic chain position, assigned by NodeChainService starting at 1. */
    @PrimaryColumn({ type: 'integer', name: 'sequence_id' })
    sequenceId!: number;

    /** Symbolic name of the recorded event (e.g. 'process.admitted', 'pot.verified'). */
    @Column({ type: 'varchar', length: 128, name: 'event_type' })
    eventType!: string;

    /** Structured event body. Serialized via JSON.stringify when hashing. */
    @Column({ type: 'simple-json', name: 'payload' })
    payload!: Record<string, unknown>;

    /** Deterministic tick from ClockService.now() captured at append time. */
    @Column({ type: 'bigint', name: 'timestamp', transformer: numericBigintTransformer })
    timestamp!: number;

    /** Hash of the previous snapshot; empty string for the genesis record. */
    @Column({ type: 'varchar', length: 128, name: 'prev_hash' })
    prevHash!: string;

    /** sha256(JSON.stringify(payload) + prevHash + sequenceId). */
    @Column({ type: 'varchar', length: 128, name: 'hash' })
    hash!: string;
}
