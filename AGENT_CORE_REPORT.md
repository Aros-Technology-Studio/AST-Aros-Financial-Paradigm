# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `agent/core-emission`
**Date:** 2026-06-24
**Task:** Audit ArosCoin emission logic against the canonical model; correct remaining deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical reference docs |
| `10_proof_of_transaction_engine/` | PoT documentation only | Historical reference docs |
| `src/token/` | Does not exist | — |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation (20 lines) | Read |
| `reference/ast-core/src/aroscoin.ts` | Reference implementation (27 lines) | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` does not exist — no legacy token module. Production emission logic lives in
`src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` and `10_proof_of_transaction_engine/` contain documentation only,
not executable code. Neither is deprecated in the software sense; they are reference docs.
The PoT runtime is `src/pot/pot.service.ts`; the emission runtime is `src/emission/emission.service.ts`.

---

## 2. Canonical Model

```
Emission     = Transaction Amount                              (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → AFC Reserve, NodeChain audit trail)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verdict.verified === 1
  commission.accrue(fee, participants)
  BURN(amount)  ← cycle completion; net circulating change = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              ← spec I-RS-1/I-RS-2; confirmed volume only
  internalPrice  = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals   → NodeChain (audit trail), not in formula
```

Reference example ($10,000 transaction):
```
TX Amount   = 10,000
Emission    = 10,000 ARO   (minted, 1:1)
Commission  = 10,000 × 0.005 = 50 ARO
  Node pool = 50 × 0.75 = 37.50 ARO  (distributed by PoT weight at epoch finalization)
  AFC share = 50 × 0.25 = 12.50 ARO  (routed to Reserve)
Burn        = 10,000 ARO   (process part removed on completion)
Net change  = 0
```

---

## 3. Audit Findings — Full Conformance

### EmissionService (`src/emission/emission.service.ts`)

The service implements the canonical model with precision:

**`calculate(txAmount, commissionRate = 0.005)`** — pure function, no side effects:
```typescript
const emission = txAmount;                      // 1:1
const commission = txAmount * commissionRate;   // 0.5%
return {
    emission,
    commission,
    nodeShare: commission * 0.75,               // 75%
    afcShare: commission * 0.25,                // 25%
    net: 0,
};
```

**`emit(processId, amount)`** — PoT-gated full lifecycle:
- Reads `pot.getVerdict(processId)` — returns `{ authorized: false, minted: 0, burned: 0 }` if `verdict.verified !== 1`
- Calls `mint()` then `burn()` for verified processes, recording both events in NodeChain

**`mint(processId, amount)`** — enforces PoT gate:
- Throws if `verdict.verified !== 1` (no silent mint possible — I2/P7)
- Calls `coin.recordMint(amount)` and `chain.append('emission.minted', ...)`

**`burn(processId, amount)`** — cycle symmetry:
- Calls `coin.recordBurn(amount)` and `chain.append('emission.burned', ...)`
- Mirrors the mint, nets the process part to zero (I5/I-EM-3)

**Verdict: ✓ 100% aligned with canonical model and reference implementation**

### OrchestratorService (`src/orchestrator/orchestrator.service.ts`)

The full process lifecycle implements canonical order:
```
initiation → admissibility check → node assignment → execution
→ PoT verify → emission.mint → commission.accrue → emission.burn
→ reserve update → final record → AllSeeingEye.compareSupply
```

Commission is accrued between mint and burn, matching the reference orchestrator's order (I5/I-EM-3).
The AllSeeingEye only logs and compares — it never changes state (I10/P6).

**Verdict: ✓ Canonical lifecycle, correct ordering**

### ArosCoinService (`src/aroscoin/aroscoin.service.ts`)

Supply identity (I6/I-AC-5) is implemented exactly:
```typescript
totalSupply = (processMinted - processBurned) + earnedRetained
```

Single-row persisted ledger (`ArosCoinLedger`). Supply is always derived, never assigned directly.
`processNet()` converges to 0 after completed cycles (I5). No deposit path or mint-on-deposit (P5).

**Verdict: ✓ Exact match with reference**

### CommissionService (`src/commission/commission.service.ts`)

- `computeFee(amount)` = `amount × 0.005` (0.5%)
- `finalizeEpoch`: node share = 75% of pool, AFC margin = 25% of pool
- Only PoT-confirmed participation (`verified === 1`) counts toward weight (P2/I-CM-2)
- Reconciliation: `Σ(payments) + afcMargin == totalFees` within epsilon 1e-9 (I7)

**Verdict: ✓ 75/25 split canonical; PoT-gated participation**

---

## 4. Invariants and Prohibitions

| ID | Rule | Status |
|----|------|--------|
| I1 | Value exists only when PoT verified == 1 | ✓ Enforced in `emit()` and `mint()` |
| I2 | Every emission bound to a confirmed process | ✓ `mint()` throws on unverified |
| I3 | Every significant event recorded in NodeChain | ✓ `emission.minted`, `emission.burned` appended |
| I4 | Deterministic execution: same input → same result | ✓ Pure `calculate()`; verdict-driven logic |
| I5 | Earned retained; process part burned; processNet → 0 | ✓ `burn()` mirrors `mint()` 1:1 |
| I6 | totalSupply derivable = (minted−burned)+earnedRetained | ✓ Formula in `ArosCoinService.totalSupply()` |
| I7 | Commission pool reconciles: Σ(payments)+margin == Σ(fees) | ✓ Epsilon 1e-9 in `finalizeEpoch()` |
| I8 | NodeChain append-only and hash-continuous | ✓ `nodechain.service.ts` |
| I9 | Node influence from work+reputation, not balance | ✓ No `stake` field; weight from reputation |
| I10 | AllSeeingEye passive: signals only | ✓ Eye only logs and compares, never mutates |

| ID | Prohibition | Status |
|----|-------------|--------|
| P1 | No staking / stakedBalance / stake_freeze | ✓ Not present |
| P2 | No slashing against balance or stake | ✓ Not present |
| P3 | No token-weighted governance | ✓ Not present |
| P4 | No farming / passive yield for holding | ✓ Not present |
| P5 | No mint-on-deposit / crypto→ArosCoin conversion | ✓ Not present |
| P6 | AllSeeingEye not halting/voting/enforcing | ✓ Passive observation only |
| P7 | No emission outside confirmed-process logic | ✓ PoT gate mandatory |
| P8 | Positive-language comments only | ✓ All service comments are positive |

---

## 5. Test Coverage

| File | Tests | Canonical Formula |
|------|-------|-------------------|
| `src/emission/emission.service.spec.ts` | I1/I5/I6, I2, P7, I4, I3, calculate() | ✓ $10,000 reference example |
| `src/aroscoin/aroscoin.service.spec.ts` | I5, I6, P5, snapshot | ✓ Supply identity |
| `src/commission/commission.service.spec.ts` | I7, P2, determinism | ✓ 75/25 split |
| `src/invariants/invariants.spec.ts` | I1–I10 end-to-end | ✓ All invariants |

The `emission.service.spec.ts` includes the canonical $10,000 reference example test at line 153,
asserting `emission = 10,000`, `commission ≈ 50`, `nodeShare ≈ 37.5`, `afcShare ≈ 12.5`, `net = 0`.

---

## 6. Summary

**The canonical 1:1 emission model is fully implemented and operational.**

No code changes were required. The implementation in `src/emission/`, `src/aroscoin/`,
`src/commission/`, and the full lifecycle in `src/orchestrator/` all conform to the Model-1
specification in `docs/specs/AST_Emission_AGENT_EN.md` and the reference in
`reference/ast-core/src/emission.ts`.

The `01_coin_engine/` and `10_proof_of_transaction_engine/` directories are documentation
folders, not deprecated code. The active production implementation is the NestJS module layer
under `src/`.

---

*Generated by AGENT-CORE on branch `agent/core-emission`, 2026-06-24.*
