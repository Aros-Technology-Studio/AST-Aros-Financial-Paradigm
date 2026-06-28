import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Stores the deterministic numeric tick alongside Postgres' `bigint`, which TypeORM
 * surfaces as a string by default. The transformer keeps the runtime value numeric
 * so hash recomputation and signal ordering see exactly the value ClockService produced.
 */
const numericBigintTransformer = {
    to: (value: number): number => value,
    from: (value: string | number | null): number => (value === null ? null : Number(value)),
};

/**
 * OversightLogEntry — one record of the immutable Oversight Ledger.
 *
 * Each entry is a passive observation produced by the All-Seeing Eye. Entries are
 * cryptographically linked through `prevHash`, forming an append-only Merkle-linked
 * chain that is separate from the NodeChain. The Eye writes here as its only output:
 * it witnesses, records, and emits non-binding integrity signals.
 *
 * Spec: docs/specs/AST_AllSeeingEye_AGENT_EN.md (data_model.OversightLogEntry).
 */
@Entity({ name: 'oversight_log_entries' })
@Index('uq_oversight_log_entries_id', ['id'], { unique: true })
export class OversightLogEntry {
    /** Monotonic position in the oversight ledger, assigned by the database. */
    @PrimaryGeneratedColumn({ type: 'integer', name: 'id' })
    id!: number;

    /** Category of observation (e.g. 'heartbeat', 'integrity_signal', 'anomaly_detected', 'scope_violation'). */
    @Column({ type: 'varchar', length: 64, name: 'event_type' })
    eventType!: string;

    /** Observable scope the entry refers to (e.g. 'token_management', 'ledger_anchoring', 'supervisory'). */
    @Column({ type: 'varchar', length: 64, name: 'layer' })
    layer!: string;

    /** Human-readable description of the observation; metadata only, no raw transaction or user data. */
    @Column({ type: 'varchar', length: 1024, name: 'description' })
    description!: string;

    /** sha256(eventType + layer + description + prevHash + timestamp). */
    @Column({ type: 'varchar', length: 128, name: 'hash' })
    hash!: string;

    /** Hash of the previous oversight entry; the literal 'GENESIS' for the first record. */
    @Column({ type: 'varchar', length: 128, name: 'prev_hash' })
    prevHash!: string;

    /** Deterministic tick from ClockService.now() captured at write time. */
    @Column({ type: 'bigint', name: 'timestamp', transformer: numericBigintTransformer })
    timestamp!: number;

    /** Optional signature attached by an Observer Node; empty string when unsigned. */
    @Column({ type: 'varchar', length: 256, name: 'signature', default: '' })
    signature!: string;
}
