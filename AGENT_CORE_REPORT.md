# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-6tuJK`
**Date:** 2026-06-02
**Task:** Audit ArosCoin emission logic against the canonical model, identify gaps, and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no executable source code)

Module 01 is **NOT deprecated** — it is the authoritative specification layer.
All source code lives in `src/token/` and `src/fee_distribution/`.

| File | Pre-PR #72 content | Current state |
|------|-------------------|---------------|
| `coin_emission_model.md` | `E = F / N` (fee ÷ nodes) | ✅ Rewritten to canonical 1:1 + AFC reserve index |
| `aro_emission_protocol.md` | `EMISSION_AMOUNT = Σ(load × index × ratio)` | ✅ Rewritten to canonical formulas + mermaid lifecycle |
| `payment_distribution.md` | 60/15/15/5/5 multi-actor split | ✅ Rewritten to 75/25 canonical split |
| `burn_and_mint_rules.md` | Correct general burn policy | ✅ Left as-is (no conflicts) |
| `README.md` | Architecture overview | ✅ Left as-is (no conflicts) |

### 10_proof_of_transaction_engine — Status: Documentation only

Contains PoT spec documents (validation logic, slashing, signature model, incentive distribution).
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic present.

### src/token/ — Canonical code verified ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve()` now public |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is a no-op stub |
| `token.module.ts` | ✅ `EmissionService` registered and exported |
| `token.controller.ts` | ✅ New `POST /api/v1/token/emit` canonical endpoint added |

### src/fee_distribution/ — Gap identified and fixed ✅

| File | Previous state | Action taken |
|------|---------------|--------------|
| `fee_distribution.service.ts` | `distributeRewards()` applied 75/25 split to ledger correctly BUT never called `EmissionService.updateAfcReserve()` — epoch AFC accumulation was invisible to the price index | **Fixed**: `EmissionService` injected; `updateAfcReserve(afcReserve)` now called after every epoch distribution |

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes (per-TX **and** per-epoch) | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000`; now updated from both paths |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` + `emissionService.updateAfcReserve()` |
| Atomic execution | All 4 steps or none | ✅ Single `QueryRunner` transaction in `processTransactionEmission()` |

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT

FeeDistributionService.distributeRewards(epoch, fees, weights)
  │
  ├─ nodePool   = fees × 0.75  → per-node ledger VALIDATOR_REWARD records
  ├─ afcReserve = fees × 0.25  → ledger FEE_DISTRIBUTION to SYSTEM_AFC_RESERVE
  └─ emissionService.updateAfcReserve(afcReserve)  ← NEW: syncs price index
```

All per-TX steps execute atomically inside a `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four per-TX ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. Epoch-level AFC contributions update the same `reserveIndex` (gap fixed in this pass)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | `updateAfcReserve()` visibility changed from `private` → `public` (needed by epoch distribution path) |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; added `emissionService.updateAfcReserve(afcReserve)` call after epoch AFC ledger record |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` endpoint — canonical entry point for 1:1 emission |
| `tests/unit/token/emission.spec.ts` | New test file — 15 tests covering `calculate()`, AFC reserve index, and `updateCommissionRate()` |

---

## 7. Test Results

```
PASS tests/unit/token/emission.spec.ts
  EmissionService — canonical 1:1 model
    calculate()
      ✓ emits exactly 1:1 with transaction amount
      ✓ applies default 0.5% commission rate
      ✓ splits commission 75% nodes / 25% AFC (canonical)
      ✓ node + AFC shares sum to commission exactly
      ✓ respects a custom commission rate
      ✓ handles small (dust) amounts without error
      ✓ throws BadRequestException for zero amount
      ✓ throws BadRequestException for negative amount
    AFC reserve price index
      ✓ starts at 1.0 (no reserve)
      ✓ rises monotonically as reserve accumulates
      ✓ follows sqrt formula: 1.0 + sqrt(total) / 10_000
      ✓ getAfcReserveState reflects accumulated reserve
    updateCommissionRate()
      ✓ changes the default rate for subsequent calculations
      ✓ rejects rate of 0
      ✓ rejects rate >= 1

Tests: 15 passed, 15 total
```

---

## 8. Open Recommendations

The following items were identified but are out of scope for this pass:

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic epoch snapshots and a load-on-boot mechanism.
- **Replace all `mint()` calls in bridge/ingestion path** — `TokenController.mint()` and `BridgeService` still call the legacy `TokenService.mint()`. Migrate to `mintForTransaction()` for full canonical compliance.
- **Integration test for epoch + emission price** — verify that after N epoch finalizations, `getCurrentEmissionPrice()` equals the sum of all per-epoch AFC contributions applied to the index formula.
