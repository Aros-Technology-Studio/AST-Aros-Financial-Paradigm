import { Injectable } from '@nestjs/common';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { NodeChainService } from '../nodechain/nodechain.service';
import { PotService } from '../pot/pot.service';

/** Default commission rate applied when the caller supplies no override. */
const DEFAULT_FEE_RATE = 0.005;

/** Node pool share of the commission per canonical 75/25 split. */
const NODE_POOL_SHARE = 0.75;

/** AFC reserve share of the commission per canonical 75/25 split. */
const AFC_RESERVE_SHARE = 0.25;

/**
 * Pure, side-effect-free breakdown of the canonical 1:1 emission cycle for a given
 * transaction amount. All figures are derived deterministically from `txAmount` and `rate`.
 */
export interface EmissionCalculation {
    /** Process part minted 1:1 with the transaction amount (canonical formula). */
    emission: number;
    /** Operation fee charged on the transaction: `txAmount × rate`. */
    commission: number;
    /** Node pool allocation: `commission × 0.75` (75% to participating nodes by PoT weight). */
    nodeShare: number;
    /** AFC reserve allocation: `commission × 0.25` (25% grows the capitalization index). */
    afcShare: number;
}

/** Outcome of an emission attempt, as returned to callers. */
export interface EmitResult {
    /** Whether the PoT gate authorized emission for this process. */
    authorized: boolean;
    /** Amount of the process part minted (and burned) for the process; 0 when unauthorized. */
    minted: number;
    /** Amount of the process part burned on cycle completion; 0 when unauthorized. */
    burned: number;
    processId: string;
}

/**
 * EmissionService — the disciplined supply control of AST.
 *
 * Emission is the sole minter of ArosCoin. It brings the process part into existence as a
 * consequence of confirmed work and removes it when the cycle completes, keeping supply
 * causally tied to executed, verified work. It mirrors `reference/ast-core/src/emission.ts`.
 *
 * Canonical 1:1 emission formula (see `calculate()`):
 *   emission   = txAmount          (1:1, no multiplier)
 *   commission = txAmount × rate   (default 0.5%)
 *   nodeShare  = commission × 0.75 (75% → node pool by PoT weight)
 *   afcShare   = commission × 0.25 (25% → AFC reserve, grows capitalization index)
 *
 * The PoT gate is mandatory: `emit` first reads the recorded verdict for the process and
 * proceeds only when `verified === 1`. For any process that is not verified, Emission mints
 * and burns nothing at all and returns `{ authorized: false, minted: 0, burned: 0 }`, so no
 * value can exist outside a confirmed process (project I1/I2/P7, spec I-EM-1/I-EM-2). Both
 * the mint and the burn are recorded in NodeChain (`emission.minted`, `emission.burned`).
 *
 * The earned part is not handled here: it is paid by Commission for executed work and stays
 * with the infrastructure. Emission concerns only the process part, which is minted then
 * burned within the same confirmed process so its net contribution returns to zero
 * (`processNet -> 0`, project I5, spec I-EM-3).
 *
 * Spec: docs/specs/AST_Emission_AGENT_EN.md
 * Reference: reference/ast-core/src/emission.ts
 */
@Injectable()
export class EmissionService {
    constructor(
        private readonly coin: ArosCoinService,
        private readonly pot: PotService,
        private readonly chain: NodeChainService,
    ) { }

    /**
     * Pure, deterministic breakdown of the canonical 1:1 emission cycle. No side effects.
     * The emission equals the transaction amount exactly (1:1 canonical formula). Commission
     * and its 75/25 split are derived from `txAmount` and `rate`; they are accrued by
     * Commission separately and are not minted here.
     *
     * Example — $10,000 transaction at default rate:
     *   emission   = 10,000 ARO
     *   commission = 50 ARO  (10,000 × 0.005)
     *   nodeShare  = 37.50 ARO  (50 × 0.75)
     *   afcShare   = 12.50 ARO  (50 × 0.25)
     */
    calculate(txAmount: number, rate = DEFAULT_FEE_RATE): EmissionCalculation {
        const emission = txAmount;                      // 1:1 canonical formula
        const commission = txAmount * rate;
        const nodeShare = commission * NODE_POOL_SHARE;
        const afcShare = commission * AFC_RESERVE_SHARE;
        return { emission, commission, nodeShare, afcShare };
    }

    /**
     * Run the process-part emission cycle for a confirmed process: derive the emission amount
     * via `calculate()` (canonical 1:1 formula), mint the process part, record it, then burn
     * it on completion and record that. Gated on PoT: emission proceeds only when the process
     * verdict is `verified === 1`. The process part is bound to `processId` and the emission
     * equals the transaction amount 1:1 (`emissionVolume = txAmount`, spec I-EM-1).
     *
     * When the process is not verified (no verdict, or verdict 0), nothing is minted or
     * burned and the ledger is untouched (I1/I2/P7).
     */
    async emit(processId: string, txAmount: number): Promise<EmitResult> {
        const verdict = await this.pot.getVerdict(processId);
        if (!verdict || verdict.verified !== 1) {
            return { authorized: false, minted: 0, burned: 0, processId };
        }

        const { emission } = this.calculate(txAmount);  // 1:1: emission === txAmount
        const minted = await this.mint(processId, emission);
        const burned = await this.burn(processId, minted);
        return { authorized: true, minted, burned, processId };
    }

    /**
     * Mint the process part for a verified process and record the mint in NodeChain.
     * The mint is authorized only when the recorded verdict is `verified === 1`; refusing
     * otherwise upholds the PoT gate (spec I-EM-2). Returns the minted amount.
     */
    async mint(processId: string, amount: number): Promise<number> {
        const verdict = await this.pot.getVerdict(processId);
        if (!verdict || verdict.verified !== 1) {
            throw new Error(`emission refused for ${processId}: no PoT confirmation (verified === 1 required)`);
        }
        await this.coin.recordMint(amount);
        await this.chain.append('emission.minted', { processId, minted: amount });
        return amount;
    }

    /**
     * Burn the process part on cycle completion and record the burn in NodeChain. The burn
     * mirrors the mint so the process part nets to zero (cycle symmetry, spec I-EM-3).
     */
    async burn(processId: string, amount: number): Promise<number> {
        await this.coin.recordBurn(amount);
        await this.chain.append('emission.burned', { processId, burned: amount });
        return amount;
    }

    /** Current derived total supply, read through the unit ledger. */
    async totalSupply(): Promise<number> {
        return this.coin.totalSupply();
    }
}
