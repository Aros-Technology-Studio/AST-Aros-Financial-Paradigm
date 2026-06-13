# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-81v4k8`  
**Date:** 2026-06-13  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split with validator weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; correct burn policy |

**Module 01 is NOT deprecated** — pure documentation. Canonical source lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code verified

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.reserveIndex`; `updateInternalValuation()` is a no-op stub |
| `token.controller.ts` | ✅ **Now exposes** `POST /api/v1/token/emit` (canonical entry point) — **added in this pass** |

### src/fee_distribution/ — Canonical code verified

`fee_distribution.service.ts → distributeRewards()` applies **75/25 split** at epoch finalization:
- 75% → node pool (divided by PoT-normalized weight)
- 25% → `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger (`log1p` index); used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|-----------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Canonical HTTP endpoint | Yes | ✅ `POST /api/v1/token/emit` added in this pass |

---

## 3. Implementation Detail

### EmissionService lifecycle (`src/token/emission.service.ts`)

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
```

All four ledger operations are atomic within a single `QueryRunner` transaction.

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
4. `reserveIndex` is monotonically non-decreasing
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` route — canonical entry point backed by `mintForTransaction()` |
| `AGENT_CORE_REPORT.md` | Updated with full audit results (this file) |

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Sync epoch AFC into `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
- **Migrate bridge/ingestion callers** — replace all direct `mint()` calls in the ingestion pipeline with `mintForTransaction()` so every inbound transaction triggers the canonical fee-split and burn cycle.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
