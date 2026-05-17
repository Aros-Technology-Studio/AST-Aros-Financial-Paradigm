# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-17  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical sequence diagram, 75/25 split, burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split, validator weight formula |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy, non-contradictory |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code: `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle. `addAfcReserve()` public method added (this pass) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | **FIXED** — `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` (was using `ProcessReserveLedgerService`'s non-canonical log1p formula) |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status

| File | State |
|------|-------|
| `fee_distribution.service.ts` | **FIXED** — `distributeRewards()` now calls `emissionService.addAfcReserve()` to sync the in-memory price index after epoch settlement |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Volume ledger for legacy analytics; `reserveIndex` via `log1p` — no longer used for canonical price |
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
| Epoch AFC fees update price index | Yes | **FIXED** — `emissionService.addAfcReserve()` called after epoch settlement |
| `getCurrentPrice()` returns canonical formula | Yes | **FIXED** — delegates to `emissionService.getCurrentEmissionPrice()` |

---

## 3. Issues Found and Fixed This Pass

### Issue 1 — `TokenomicsService.getCurrentPrice()` used wrong formula (FIXED)

**Pre-fix:** Returned `processReserve.getReserveState().reserveIndex`, which is calculated as
`1.0 + log1p(totalProcessVolume) / 100`. This uses:
- A different formula (log1p/100 vs canonical sqrt/10_000)
- A different variable (total tx volume vs AFC reserve balance)

At 100 units of input the difference is stark:
- Legacy formula: `1.0 + log1p(100)/100 = 1.046`
- Canonical formula: `1.0 + sqrt(100)/10_000 = 1.001`

**Fix:** `TokenomicsService` now injects `EmissionService` and `getCurrentPrice()` returns
`this.emissionService.getCurrentEmissionPrice()`.

### Issue 2 — Epoch AFC fees did not update `EmissionService` in-memory state (FIXED)

**Pre-fix:** `FeeDistributionService.distributeRewards()` correctly recorded the epoch AFC reserve
contribution to the ledger (`AFC_RESERVE_${epoch}` transaction), but did NOT call
`EmissionService.updateAfcReserve()`. The in-memory `afcReserveState` (which drives
`reserveIndex`) was therefore only updated per-transaction via `processTransactionEmission()`.
Epoch-level fees had zero effect on the emission price index.

**Fix:**
1. Added `public addAfcReserve(amount: number): void` to `EmissionService` — wraps the private
   `updateAfcReserve()` for external callers.
2. `FeeDistributionService.distributeRewards()` now injects `EmissionService` and calls
   `this.emissionService.addAfcReserve(afcReserve)` immediately after recording the AFC ledger entry.

---

## 4. Canonical Emission Lifecycle (Confirmed)

### EmissionService — `src/token/emission.service.ts`

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
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger steps execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch Finalization

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.addAfcReserve(afcReserve)   ← NEW: syncs price index
  └─ For each node: Ledger VALIDATOR_REWARD: nodePool × weight → nodeId
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 5. Example: $10,000 Transaction

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

## 6. Invariants (All Verified)

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss)
3. `totalMinted == totalBurned` per canonical TX cycle (net zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. Epoch AFC fees update `reserveIndex` via `addAfcReserve()` (fixed this pass)
7. `TokenomicsService.getCurrentPrice()` returns canonical sqrt-based index (fixed this pass)

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots and restore on boot.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace any remaining `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and `addAfcReserve()`.
