import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Keeps decimal supply tallies numeric at runtime. TypeORM surfaces `decimal` columns
 * as strings by default; this transformer restores plain numbers so supply arithmetic
 * and comparisons see exactly the values that were recorded, on both SQLite and Postgres.
 */
const numericDecimalTransformer = {
    to: (value: number): number => value,
    from: (value: string | number | null): number => (value === null ? 0 : Number(value)),
};

/**
 * ArosCoinLedger — the single-row persisted tally from which supply is derived.
 *
 * A solitary row (fixed primary key {@link ArosCoinLedger.LEDGER_ID}) carries the three
 * running totals that define ArosCoin supply: `processMinted` and `processBurned` (the
 * process part, born and burned within a confirmed process) and `earnedRetained` (value
 * paid for executed work and held by nodes/AST). totalSupply is always computed from these
 * tallies — `(processMinted - processBurned) + earnedRetained` — and never stored as an
 * authority of its own, so it remains derivable from recorded history (project I6, spec
 * I-AC-5). Persisting the tallies lets the derived supply survive restarts.
 *
 * Spec: docs/specs/AST_ArosCoin_AGENT_EN.md (data_model.SupplySnapshot).
 * Reference: reference/ast-core/src/aroscoin.ts (ArosCoin).
 */
@Entity({ name: 'aroscoin_ledger' })
export class ArosCoinLedger {
    /** The fixed identity of the one ledger row. */
    static readonly LEDGER_ID = 1;

    /** Primary key fixed to LEDGER_ID; exactly one ledger row exists. */
    @PrimaryColumn({ type: 'integer', name: 'id' })
    id!: number;

    /** Total ArosCoin issued for processes (the process part), across all confirmed processes. */
    @Column({ type: 'decimal', name: 'process_minted', default: 0, transformer: numericDecimalTransformer })
    processMinted!: number;

    /** Total process part burned on cycle completion. Converges to processMinted (I5). */
    @Column({ type: 'decimal', name: 'process_burned', default: 0, transformer: numericDecimalTransformer })
    processBurned!: number;

    /** Total value earned for executed work and retained by nodes/AST (the earned part). */
    @Column({ type: 'decimal', name: 'earned_retained', default: 0, transformer: numericDecimalTransformer })
    earnedRetained!: number;
}
