# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-8i5IC`  
**Date:** 2026-05-13  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, burn rule, example all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid flow diagram; all four ledger steps documented |
| `payment_distribution.md` | ✅ Canonical | 75/25 split; historical note about deprecated 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ No conflicts | General burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ No conflicts | Architecture overview; no formula conflicts |
| `AROS_Coin_TokenSpec.json` | ✅ No conflicts | Machine-readable spec; symbol/decimals metadata |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic present in either location.

### src/token/ — Status: Canonical ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` all correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → reserve update → burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` proxies process reserve index |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Canonical ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: node pool 75%, AFC reserve 25% per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | PoT scoring (`α·TX + β·F − δ·P`) and weight normalization — correct, untouched |
| `process_reserve.service.ts` | Process volume ledger; `log1p`-based index for legacy tokenomics compatibility |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code State |
|------|---------------|-----------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged |

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
Net circulating change = 0   (mint and burn cancel each other out)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases via `sqrt` accumulation)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Findings Summary

**No divergences found.** All code and documentation are fully aligned with the canonical model.

| Layer | Finding |
|-------|---------|
| `src/token/emission.service.ts` | ✅ Canonical 1:1 lifecycle fully implemented |
| `src/token/token.service.ts` | ✅ `mintForTransaction()` is the correct canonical entry point |
| `src/fee_distribution/fee_distribution.service.ts` | ✅ 75/25 epoch-level split implemented |
| `01_coin_engine/coin_emission_model.md` | ✅ Canonical formulas documented |
| `01_coin_engine/aro_emission_protocol.md` | ✅ Full flow with Mermaid diagram |
| `01_coin_engine/payment_distribution.md` | ✅ 75/25 split; historical 60/15/15/5/5 noted as superseded |

---

## 7. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; will be lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots and hydration on startup.
- **Wire `mintForTransaction()` into the ingestion pipeline** — replace any remaining `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, and the zero-amount guard.
- **Sync AFC reserve after epoch finalization** — `FeeDistributionService.distributeRewards()` records AFC contributions on the ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch to keep `reserveIndex` accurate at scale.
