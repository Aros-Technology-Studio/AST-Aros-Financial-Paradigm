import { Injectable } from '@nestjs/common';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { NodeChainService } from '../nodechain/nodechain.service';
import { PotService } from '../pot/pot.service';

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
     * Run the process-part emission cycle for a confirmed process: mint the process part,
     * record it, then burn it on completion and record that. Gated on PoT: emission proceeds
     * only when the process verdict is `verified === 1`. The process part is bound to
     * `processId` and `amount` is proportional to the process value (`emissionVolume`).
     *
     * When the process is not verified (no verdict, or verdict 0), nothing is minted or
     * burned and the ledger is untouched (I1/I2/P7).
     */
    async emit(processId: string, amount: number): Promise<EmitResult> {
        const verdict = await this.pot.getVerdict(processId);
        if (!verdict || verdict.verified !== 1) {
            return { authorized: false, minted: 0, burned: 0, processId };
        }

        const minted = await this.mint(processId, amount);
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

    /**
     * Pure canonical formula for a transaction emission cycle. No side effects; does not
     * touch the ledger, PoT, or NodeChain. Returns the exact values the canonical model
     * specifies for a given transaction amount:
     *
     *   emission     = txAmount          (1:1 — no multiplier)
     *   commission   = txAmount × rate   (default 0.5%)
     *   nodeShare    = commission × 0.75 (75% → processing nodes by PoT weight)
     *   afcShare     = commission × 0.25 (25% → AFC reserve, growing reserveIndex)
     *   net          = 0                 (emission minted then burned; cycle is symmetric)
     */
    calculate(
        txAmount: number,
        commissionRate = 0.005,
    ): { emission: number; commission: number; nodeShare: number; afcShare: number; net: number } {
        const emission = txAmount;
        const commission = txAmount * commissionRate;
        return {
            emission,
            commission,
            nodeShare: commission * 0.75,
            afcShare: commission * 0.25,
            net: 0,
        };
    }
}
