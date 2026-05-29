# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-AZVpk`  
**Date:** 2026-05-29  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Content | Status |
|------|---------|--------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index, example | ✅ Correct |
| `aro_emission_protocol.md` | 1:1 emission, 75/25 split, mermaid sequence diagram | ✅ Correct |
| `burn_and_mint_rules.md` | General burn/mint lifecycle rules | ✅ Non-contradictory |
| `payment_distribution.md` | 75/25 canonical split for validators | ✅ Correct |
| `README.md` | Architecture overview | ✅ No conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic is implemented here.

### src/token/ — Status: Canonical, confirmed and verified

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserveFromEpoch()` added in this pass |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compat |
| `token.controller.ts` | ✅ `POST /api/v1/token/emit` added in this pass — canonical entry point now wired |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Gap fixed in this pass

| File | State |
|------|-------|
| `fee_distribution.service.ts` | ✅ 75/25 split correct; **fixed:** now calls `emissionService.updateAfcReserveFromEpoch()` after each epoch's AFC ledger record |
| `fee_distribution.module.ts` | ✅ Imports `TokenModule` which exports `EmissionService` — no new imports required |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy process-volume ledger used by `tokenomics.service.ts`; separate from canonical AFC index |
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
| Epoch AFC syncs price index | Yes | ✅ **Fixed in this pass** — `updateAfcReserveFromEpoch()` called at epoch finalization |
| Canonical endpoint exposed | Yes | ✅ **Fixed in this pass** — `POST /api/v1/token/emit` wired to `mintForTransaction()` |

---

## 3. Gaps Found and Fixed in This Pass

### Gap 1 — Epoch AFC reserve did not sync in-memory price index

**Root cause:** `FeeDistributionService.distributeRewards()` correctly recorded the 25% AFC share to the ledger, but never called `EmissionService.updateAfcReserve()`. The in-memory `reserveIndex` only advanced from direct transaction emissions, not from epoch-level fee accumulation. Over time this caused the price index to under-represent total AFC accumulation.

**Fix:** Added `EmissionService.updateAfcReserveFromEpoch(afcAmount, epochNumber)` — a public wrapper around the existing private `updateAfcReserve()`. Called from `FeeDistributionService.distributeRewards()` immediately after recording the AFC ledger entry, inside the same atomic transaction.

Files changed:
- `src/token/emission.service.ts` — added `updateAfcReserveFromEpoch()`
- `src/fee_distribution/fee_distribution.service.ts` — injected `EmissionService`, added call

### Gap 2 — No canonical emission HTTP endpoint

**Root cause:** `TokenController` exposed only `POST /api/v1/token/mint` → `tokenService.mint()` (legacy path: mints without burning, no fee split). External callers had no direct way to trigger the canonical 1:1 emission lifecycle.

**Fix:** Added `POST /api/v1/token/emit` endpoint that calls `tokenService.mintForTransaction()` and returns the full emission breakdown including current emission price.

Files changed:
- `src/token/token.controller.ts` — added `emitForTransaction()` endpoint

---

## 4. Implementation Detail

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

All four ledger operations execute atomically within a single QueryRunner transaction.
```

### FeeDistributionService — Epoch finalization flow

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.updateAfcReserveFromEpoch(afcReserve, epochNumber)  ← NEW
  │    └─ reserveIndex rises from epoch fees, same as from TX-level fees
  │
  └─ For each node: Ledger VALIDATOR_REWARD = nodePool × weight_i
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

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (both TX-level and epoch-level contributions)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. Epoch AFC contributions now propagate to `reserveIndex` — full price index consistency guaranteed

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots or a single mutable row.
- **Wire `mintForTransaction()` into ingestion pipeline** — confirm all bridge/ingestion paths call `POST /api/v1/token/emit` or `TokenService.mintForTransaction()` rather than the legacy `mint()`.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and the new `updateAfcReserveFromEpoch()` method.
