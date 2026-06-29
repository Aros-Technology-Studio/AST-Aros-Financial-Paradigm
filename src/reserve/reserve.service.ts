import { Injectable } from '@nestjs/common';
import { log10 } from '../common/hash.util';
import { NodeChainService } from '../nodechain/nodechain.service';

/**
 * ReserveService — AST's own capitalization, derived from confirmed work and AFC reserve inflows.
 *
 * The Reserve expresses how much confirmed value the economy has processed, condensed into a
 * single `reserveIndex`. That index is AST's own capitalization measure: it grows with the
 * aggregate volume of PoT-verified processes AND the AFC reserve share of commission fees, and
 * underpins internal valuation and Release readiness. It mirrors `reference/ast-core/src/reserve.ts`
 * (`reserveIndex = log10(1 + totalProcessVolume)`) and the spec (`margin_from: Commission`).
 *
 * Two confirmed-work signals feed `totalProcessVolume`:
 *   1. `emission.minted` snapshots — the process part minted for each PoT-verified process.
 *   2. `commission.epoch.finalized` snapshots — the AFC reserve share (25 %) of each epoch's
 *      fee pool, routed here by CommissionService (spec `margin_to: Reserve`).
 *
 * Both signals are read from NodeChain, the system of record. Because both are produced only
 * behind the PoT gate (emission only on verified processes; commission only on confirmed
 * participation), the combined total still grows exclusively from confirmed work (I-RS-1).
 * The index is recomputed from history on every read (I-RS-2), monotonic non-decreasing in
 * volume (I-RS-4), and reflects AST's own capitalization only — not custody (I-RS-3).
 *
 * Spec: docs/specs/AST_Reserve_AGENT_EN.md
 * Reference: reference/ast-core/src/reserve.ts
 */
@Injectable()
export class ReserveService {
    /** Event type Emission records for each minted process part (one per confirmed process). */
    private static readonly CONFIRMED_VOLUME_EVENT = 'emission.minted';

    /** Event type Commission records on epoch finalization; its `operationalMargin` field is the AFC reserve share. */
    private static readonly COMMISSION_EPOCH_EVENT = 'commission.epoch.finalized';

    /** Event type appended by Commission via `addAfcAccrual` for each epoch's AFC share. */
    private static readonly AFC_ACCRUAL_EVENT = 'reserve.afc.accrual';

    constructor(private readonly chain: NodeChainService) { }

    /**
     * Total confirmed-work volume, read from NodeChain history. Sums two signals:
     * (1) `emission.minted` — the process part minted for each PoT-verified process; and
     * (2) `commission.epoch.finalized` `operationalMargin` — the AFC reserve share (25 %) of
     *     each epoch's fee pool (spec `margin_from: Commission`).
     * Both are produced only behind the PoT gate so the aggregate remains confirmed-work
     * volume only (I-RS-1). Recomputed from history on each call (I-RS-2).
     */
    async totalProcessVolume(): Promise<number> {
        const history = await this.chain.list();
        let total = 0;
        for (const snapshot of history) {
            if (snapshot.eventType === ReserveService.CONFIRMED_VOLUME_EVENT) {
                const minted = Number(snapshot.payload['minted'] ?? 0);
                if (Number.isFinite(minted)) total += minted;
            } else if (snapshot.eventType === ReserveService.COMMISSION_EPOCH_EVENT) {
                const margin = Number(snapshot.payload['operationalMargin'] ?? 0);
                if (Number.isFinite(margin) && margin > 0) total += margin;
            }
        }
        return total;
    }

    /**
     * Aggregate AFC reserve accrued from Commission epoch finalization. Sums the `amount`
     * of every `reserve.afc.accrual` snapshot appended by Commission when it routes the
     * canonical 25% AFC share of each epoch's fee pool. Provided for audit queries; this
     * figure does not enter the reserveIndex formula (spec I-RS-1).
     */
    async totalAfcReserve(): Promise<number> {
        const history = await this.chain.list();
        let total = 0;
        for (const snapshot of history) {
            if (snapshot.eventType === ReserveService.AFC_ACCRUAL_EVENT) {
                const amount = Number(snapshot.payload['amount'] ?? 0);
                if (Number.isFinite(amount)) total += amount;
            }
        }
        return total;
    }

    /**
     * Record an AFC commission accrual into NodeChain. Called by Commission on epoch
     * finalization for the canonical 25% AFC share. The event is an audit record (spec I3);
     * it does not enter the reserveIndex formula (spec I-RS-1).
     */
    async addAfcAccrual(amount: number): Promise<void> {
        await this.chain.append(ReserveService.AFC_ACCRUAL_EVENT, { amount });
    }

    /**
     * The capitalization index: `reserveIndex = log10(1 + totalProcessVolume)`.
     * Derived solely from confirmed process volume recorded in NodeChain; soft log growth gives
     * meaningful scale at high volume while staying bounded (spec formula I-RS-2, I-RS-4).
     * With zero volume the index is `log10(1) = 0`. Monotonic non-decreasing in volume.
     * AFC accruals are recorded separately for audit but do not enter this formula (spec I-RS-1).
     */
    async reserveIndex(): Promise<number> {
        const volume = await this.totalProcessVolume();
        return log10(1 + volume);
    }

    /**
     * Internal valuation derived from accumulated work: `internalPrice = base * reserveIndex`.
     * Value follows confirmed work, not a market quote.
     */
    async internalPrice(base: number): Promise<number> {
        const index = await this.reserveIndex();
        return base * index;
    }
}
