import { Injectable } from '@nestjs/common';
import { log10 } from '../common/hash.util';
import { NodeChainService } from '../nodechain/nodechain.service';

/**
 * ReserveService — AST's own capitalization, derived from confirmed work and commission accrual.
 *
 * The Reserve expresses how much confirmed value the economy has processed, condensed into a
 * single `reserveIndex`. That index is AST's own capitalization measure: it grows with the
 * aggregate volume of PoT-verified processes AND with the AFC share of every epoch's commission
 * pool, and underpins internal valuation and Release readiness. It mirrors
 * `reference/ast-core/src/reserve.ts` and the authoritative formula
 * `reserveIndex = log10(1 + totalProcessVolume)` (docs/specs/AST_Reserve_AGENT_EN.md).
 *
 * Confirmed volume enters the reserve from `emission.minted` NodeChain events — one snapshot
 * per PoT-verified, emitted process. AFC commission accruals are also recorded in NodeChain
 * (`reserve.afc.accrual` events appended by Commission on epoch finalization) for accounting
 * and audit purposes, but they do not enter the `reserveIndex` formula (spec I-RS-1/I-RS-2).
 *
 * Because the index is recomputed from history on every read, it is derivable and never set
 * as a free authority (spec I-RS-2). As recorded volume can only accumulate on an append-only
 * chain, the index is monotonic non-decreasing (spec I-RS-4).
 *
 * The Reserve measures AST's own capitalization (spec I-RS-3). It keeps no stored state of
 * its own — every figure is derived from NodeChain history.
 *
 * Spec: docs/specs/AST_Reserve_AGENT_EN.md
 * Reference: reference/ast-core/src/reserve.ts
 */
@Injectable()
export class ReserveService {
    /** Event type Emission records for each minted process part (one per confirmed process). */
    private static readonly CONFIRMED_VOLUME_EVENT = 'emission.minted';

    /** Event type Commission appends when routing the 25% AFC share on epoch finalization. */
    static readonly AFC_ACCRUAL_EVENT = 'reserve.afc.accrual';

    constructor(private readonly chain: NodeChainService) { }

    /**
     * Aggregate of PoT-verified process volume, read from NodeChain history. Sums the
     * `minted` amount of every `emission.minted` snapshot; since Emission mints only for a
     * verified process, this is the confirmed-work volume (spec I-RS-1). Recomputed from
     * history on each call (spec I-RS-2).
     */
    async totalProcessVolume(): Promise<number> {
        const history = await this.chain.list();
        let total = 0;
        for (const snapshot of history) {
            if (snapshot.eventType === ReserveService.CONFIRMED_VOLUME_EVENT) {
                const minted = Number(snapshot.payload['minted'] ?? 0);
                if (Number.isFinite(minted)) total += minted;
            }
        }
        return total;
    }

    /**
     * Aggregate AFC reserve accrued from Commission epoch finalization. Sums the `amount`
     * of every `reserve.afc.accrual` snapshot appended by Commission when it routes the
     * canonical 25% AFC share of each epoch's fee pool. Growing with epoch settlements drives
     * the price index upward over time (spec `margin_from: Commission`).
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
     * finalization for the canonical 25% AFC share so the reserve index grows with each
     * settled epoch (spec `margin_from: Commission`, I-RS-1/I-RS-4).
     */
    async addAfcAccrual(amount: number): Promise<void> {
        await this.chain.append(ReserveService.AFC_ACCRUAL_EVENT, { amount });
    }

    /**
     * The capitalization index: `reserveIndex = log10(1 + totalProcessVolume)`.
     * Soft logarithmic growth from confirmed process volume. With zero volume the index is
     * `log10(1) = 0`. Monotonic non-decreasing in volume (spec I-RS-4).
     * Formula: docs/specs/AST_Reserve_AGENT_EN.md; reference: reference/ast-core/src/reserve.ts.
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
