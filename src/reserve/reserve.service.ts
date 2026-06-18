import { Injectable } from '@nestjs/common';
import { log10 } from '../common/hash.util';
import { NodeChainService } from '../nodechain/nodechain.service';

/**
 * ReserveService — AST's own capitalization, derived from confirmed work.
 *
 * The Reserve expresses how much confirmed value the economy has processed, condensed into a
 * single `reserveIndex`. That index is AST's own capitalization measure: it grows with the
 * aggregate volume of PoT-verified processes and underpins internal valuation and Release
 * readiness. It mirrors `reference/ast-core/src/reserve.ts`, where confirmed process amounts
 * accumulate into `totalProcessVolume` and `reserveIndex = log10(1 + totalProcessVolume)`.
 *
 * The volume is read back from NodeChain, the system of record. Emission appends one
 * `emission.minted` snapshot per process, and Emission mints only for a process whose PoT
 * verdict is `verified === 1`. Summing those minted amounts therefore aggregates exactly the
 * confirmed-work volume (spec I-RS-1: grows only from confirmed work). Because the figure is
 * recomputed from history on every read, the index is derivable and never set as a free
 * authority (spec I-RS-2). As recorded volume can only accumulate on an append-only chain,
 * the index is monotonic non-decreasing in volume (spec I-RS-4).
 *
 * The Reserve measures AST's own capitalization accumulated from confirmed work (spec
 * I-RS-3). It keeps no stored state of its own — every figure is derived from history.
 *
 * Spec: docs/specs/AST_Reserve_AGENT_EN.md
 * Reference: reference/ast-core/src/reserve.ts
 */
@Injectable()
export class ReserveService {
    /** Event type Emission records for each minted process part (one per confirmed process). */
    private static readonly CONFIRMED_VOLUME_EVENT = 'emission.minted';

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
     * The capitalization index: `reserveIndex = log10(1 + totalProcessVolume)`. The log gives
     * soft long-term growth. With zero confirmed volume the index is `log10(1) = 0`.
     * Monotonic non-decreasing in volume (spec I-RS-4).
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
