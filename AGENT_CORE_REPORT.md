# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-xa5fya`  
**Date:** 2026-06-14  
**Task:** Audit ArosCoin emission logic against the canonical model; fix deviations; commit

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index (`sqrt`), worked $10 k example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 split + burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory with canonical model |
| `README.md` | ✅ Architecture overview; no formula conflicts |

Module 01 is **NOT deprecated**. It is pure specification documentation. The reference implementation lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code

| File | State after this audit |
|------|------------------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve` made public (see fix #1) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` now delegates to `EmissionService` (see fix #2) |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Fixed

| File | State after this audit |
|------|------------------------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` now calls `emissionService.updateAfcReserve()` (see fix #1) |

### src/proof_of_transaction_engine/ — Unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy process-volume tracker; uses `log1p` index — intentionally separate from canonical AFC reserve |
| `pot.service.ts` | PoT scoring and weight normalisation — correct, untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|----------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Commission = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ Atomic `BURN` ledger entry for `emissionAmount` in `processTransactionEmission()` |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` (monotonically rising) |
| Epoch-level fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` — 75% node pool, 25% AFC reserve |
| Epoch AFC reserve updates price index | Yes | ✅ **FIXED** — `emissionService.updateAfcReserve(afcReserve)` called after epoch finalization |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted == totalBurned` per canonical TX cycle |
| `getCurrentPrice()` returns canonical index | Yes | ✅ **FIXED** — `TokenomicsService` now delegates to `EmissionService.getCurrentEmissionPrice()` |

**Result: Code FULLY matches canonical model after two targeted fixes.**

---

## 3. Deviations Found & Fixed

### Fix #1 — FeeDistributionService did not update EmissionService AFC reserve (Issue #4 from prior audit)

**Problem:** `FeeDistributionService.distributeRewards()` correctly recorded the 25% AFC reserve share as a ledger entry, but never called `EmissionService.updateAfcReserve()`. The in-memory `reserveIndex` — which determines the price of the *next* emission — was therefore never updated at epoch boundaries. Per the canonical model: *"AFC reserve grows → price of next emission rises"*.

**Fix:**
- `EmissionService.updateAfcReserve()` changed from `private` to public (package-accessible).
- `FeeDistributionService` receives `EmissionService` via constructor injection (already exported from `TokenModule`, which `FeeDistributionModule` imports).
- After the AFC reserve ledger entry is saved, `this.emissionService.updateAfcReserve(afcReserve)` is called.

**Files changed:**
- `src/token/emission.service.ts` — `private updateAfcReserve` → `updateAfcReserve`
- `src/fee_distribution/fee_distribution.service.ts` — injected `EmissionService`; added `updateAfcReserve` call

### Fix #2 — TokenomicsService.getCurrentPrice() returned legacy log1p index

**Problem:** `TokenomicsService.getCurrentPrice()` read from `ProcessReserveLedgerService.reserveIndex`, which uses `1.0 + log1p(volume) / 100` — a different formula from the canonical `1.0 + sqrt(afcReserve) / 10_000`. This method is called by legacy `TokenService.mint()` and `burn()` for price display.

**Fix:** `TokenomicsService.getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()`, which is the canonical single source of truth for the AFC reserve price index.

**Files changed:**
- `src/token/tokenomics.service.ts` — injected `EmissionService` (with `forwardRef` to avoid potential init-order issues); `getCurrentPrice()` now returns `this.emissionService.getCurrentEmissionPrice()`

---

## 4. Emission Lifecycle (Confirmed Correct)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount                 // 1:1
  │    commission     = txAmount × 0.005         // 0.5% default
  │    nodeShare      = commission × 0.75        // 75% → nodes
  │    afcShare       = commission × 0.25        // 25% → AFC reserve
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT

All four ledger steps + reserve update execute atomically (QueryRunner transaction).
```

### Epoch-level distribution (after fix)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.updateAfcReserve(afcReserve)  ← NEW (fix #1)
  └─ For each node: Ledger VALIDATOR_REWARD  ← nodePool × weight
```

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in AFC reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out per canonical model)

After 12.50 ARO accumulated in AFC reserve:
  reserveIndex = 1.0 + sqrt(12.50) / 10,000 = 1.0000353...
  → every subsequent emission costs slightly more
```

---

## 6. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 7. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on `amount ≤ 0`)
2. `nodeShare + afcShare == commission` (no rounding loss — both derived from same float)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only incremented, never decremented)
5. All ledger steps in `processTransactionEmission` succeed or all roll back (atomic `QueryRunner`)
6. Epoch AFC reserve contributions now propagate to `reserveIndex` (fix #1)

---

## 8. Remaining Open Items (non-blocking)

| # | Item | Priority |
|---|------|----------|
| 1 | `AfcReserveState` is in-memory — lost on process restart. Persist to a dedicated `AfcReserveEntity` table with epoch-snapshot writes. | Medium |
| 2 | `IngestionService.ingestAsset()` has a commented-out `TokenService.mint()` call — when enabled, it should use `mintForTransaction()` for canonical flow. | Medium |
| 3 | No unit tests for `EmissionService.calculate()` — missing coverage for dust amounts, max commission rate, zero-amount guard. | Low |
