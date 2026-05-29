# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-FO7jX`  
**Date:** 2026-05-29  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm alignment, and close remaining gaps from the previous session (PR #72 / `agent/core-emission`)

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, 75/25 split, AFC index, example |
| `aro_emission_protocol.md` | ✅ Mermaid flow diagram, canonical formulas, supply invariants |
| `payment_distribution.md` | ✅ 75/25 table, validator-weight formula, historical note on deprecated 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; general burn-on-withdrawal policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here. ✅

### src/token/ — Status: Canonical code confirmed correct

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle + new `syncEpochAfcContribution()` public method |
| `emission.service.spec.ts` | ✅ **NEW** — 26 unit tests covering all invariants, edge cases, and lifecycle |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; canonical price via `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Gap closed

| File | Change |
|------|--------|
| `fee_distribution.service.ts` | ✅ Now injects `EmissionService` and calls `syncEpochAfcContribution(afcReserve)` after each epoch finalization, so the in-memory price index reflects both per-TX and epoch-level AFC accumulation |
| `fee_distribution.service.test.ts` | ✅ Updated mock providers to include `EmissionService` |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC synced to price index | Yes | ✅ **FIXED** — `syncEpochAfcContribution()` wired into epoch finalization |

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT

syncEpochAfcContribution(epochAfcAmount)   ← new public method
  └─ updateAfcReserve(epochAfcAmount)      // price index absorbs epoch fees
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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. Epoch-level AFC contributions now also update `reserveIndex` via `syncEpochAfcContribution()`

---

## 6. Changes Made in This Session

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added `syncEpochAfcContribution(amount)` public method to expose epoch AFC sync |
| `src/token/emission.service.spec.ts` | **NEW** — 26 unit tests: `calculate()` invariants, edge cases (dust, zero, large), `processTransactionEmission()` happy/sad paths, commission rate governance, AFC reserve index formula |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`, calls `syncEpochAfcContribution(afcReserve)` after each epoch AFC ledger record |
| `src/fee_distribution/fee_distribution.service.test.ts` | Added `EmissionService` mock provider |

**Test result:** All 12 test suites pass — 98 tests total (26 new emission tests + 72 pre-existing).

---

## 7. Gap Status from Previous Session (PR #72)

| Recommendation | Status |
|----------------|--------|
| Persist `AfcReserveState` to database | ⚠️ Still in-memory; lost on restart. Tracked for future sprint. |
| Wire `mintForTransaction()` into ingestion pipeline | ⚠️ Pending; ingestion still calls legacy `mint()`. |
| Add unit tests for `EmissionService.calculate()` | ✅ **Done** — `emission.service.spec.ts` |
| Epoch AFC contribution to `EmissionService` | ✅ **Done** — `syncEpochAfcContribution()` wired into epoch finalization |
