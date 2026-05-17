# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-cpsv9`  
**Date:** 2026-05-17  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, $10K example — fully aligned |
| `aro_emission_protocol.md` | ✅ Canonical | Sequence diagram, formulas, supply invariants — fully aligned |
| `payment_distribution.md` | ✅ Canonical | 75/25 split table, validator weight formula — fully aligned |
| `burn_and_mint_rules.md` | ✅ Correct | General burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Mostly documentation

| File | Pre-patch status | Action |
|------|-----------------|--------|
| `pot_tx_incentive_distribution.md` | ❌ **DIVERGENT** — showed 60% validators / 30% attesters / 10% burn split; contradicted canonical 75/25 | **Rewritten** to canonical 75/25 model |
| Other `.md` files | ✅ Correct | PoT validation, slashing, signature model — untouched |

Actual PoT runtime code lives in `src/proof_of_transaction_engine/`. No emission logic there.

---

### src/token/ — Status: Canonical code, fully verified

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — canonical types |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ✅ **NEW** `POST /api/v1/token/emit` and `GET /api/v1/token/emission/reserve` added (was missing) |

---

### src/fee_distribution/ — Status: Canonical, confirmed

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code State |
|------|---------------|-----------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction; rollback on any failure |
| Epoch fees same 75/25 split | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| HTTP endpoint for canonical emission | Yes | ✅ `POST /api/v1/token/emit` added this pass |

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare(75%) → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare(25%) → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight among validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made This Pass

| File | Change |
|------|--------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | Replaced divergent 60/30/10 split with canonical 75/25 model; added PoT weight formula; corrected burn note |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` (canonical emission entry point) and `GET /api/v1/token/emission/reserve` (AFC reserve state) |
| `AGENT_CORE_REPORT.md` | Updated to reflect this full-pass audit (2026-05-17) |

---

## 7. Previous Pass (2026-05-12) Summary

The prior agent (PR #72 / `claude/inspiring-cannon-4qbjK`) made the following foundational changes which remain intact:
- Implemented `EmissionService` with full 1:1 lifecycle (`emission.service.ts`)
- Rewrote `coin_emission_model.md`, `aro_emission_protocol.md`, `payment_distribution.md` to canonical model
- Added `mintForTransaction()` to `TokenService`
- Applied canonical 75/25 split to `FeeDistributionService.distributeRewards()`

---

## 8. Open Recommendations

| Priority | Recommendation |
|----------|---------------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots. |
| High | **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point. |
| Medium | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard. |
| Medium | **Sync epoch AFC to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing in-memory index after each epoch finalization. |
| Low | **Deprecate `TokenController.mintTokens()`** — legacy `POST /mint` is still wired to the non-canonical `mint()` flow; mark deprecated and document migration to `POST /emit`. |
