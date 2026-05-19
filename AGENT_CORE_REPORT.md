# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-aiZDt` (task branch: `agent/core-emission`)  
**Date:** 2026-05-19  
**Task:** Full audit of ArosCoin emission logic against the canonical model; add missing unit tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Canonical state |
|------|----------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow, mermaid sequence |
| `payment_distribution.md` | ✅ 75/25 split, PoT-weighted node sub-distribution |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal; no contradictions |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source-of-truth lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — aligned |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `emission.service.spec.ts` | ✅ **NEW — added this pass** — 14 unit tests covering all invariants |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` (canonical entry point) |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; `getCurrentPrice()` proxies reserve |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75% node pool, 25% AFC reserve per epoch |

### tests/ — Status: Updated

| File | Before | After |
|------|--------|-------|
| `tests/test_emission.py` | Empty (1 blank line) | ✅ **Filled — 10 pure-math tests, all passing** |
| `src/token/emission.service.spec.ts` | Did not exist | ✅ **Created — 14 Jest tests** |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code |
|------|-----------|------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply per TX = 0 | Yes | ✅ `SupplySnapshot`: mint and burn cancel out |

---

## 3. Implementation Detail

### EmissionService canonical lifecycle (`src/token/emission.service.ts`)

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
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, float precision only)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — 14 Jest unit tests covering `calculate()`, reserve index, `processTransactionEmission()`, `updateCommissionRate()` |
| `tests/test_emission.py` | **Filled** — 10 pure-math Python tests for all canonical invariants; all pass |

No source code changes required — implementation is fully aligned with the canonical model.

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` is not updated by epoch fees.
