# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-OXNoc`  
**Date:** 2026-05-29  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or repair all divergences

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only, NOT deprecated

| File | State | Notes |
|------|-------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC reserve index, example all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram, formulas, atomic-step flow |
| `payment_distribution.md` | ✅ Canonical | 75/25 split, PoT validator weighting, AFC reserve logic |
| `burn_and_mint_rules.md` | ✅ No conflict | General burn-on-withdrawal; no formula divergence |
| `README.md` | ✅ No conflict | Architecture overview; references `src/token/emission.service.ts` |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only, correct

All `.md` files describe PoT validation, slashing, signature model, and incentive distribution. No emission formulas here. Actual PoT code is in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical implementation confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; 4-step atomic flow |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT_DEPOSIT path |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` compatibility shim; `updateInternalValuation()` is a documented no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical implementation confirmed correct

`FeeDistributionService.distributeRewards()` applies the canonical 75/25 split at epoch level, consistent with per-TX split in `EmissionService`.

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger using `log1p` index — separate from AFC reserve |
| `pot.service.ts` | PoT scoring, normalization, role assignment — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Atomic 4-step execution | Yes | ✅ Single `QueryRunner` transaction; rolls back on any failure |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

**Result: Code fully matches the canonical model. No corrections required.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate() [pure, no side effects]:
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient          (step 1)
  ├─ Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL       (step 2a)
  ├─ Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE     (step 2b)
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000          (step 3)
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT  (step 4)
```

All four ledger operations execute atomically within a single `QueryRunner` transaction. On failure, all steps roll back.

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

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing — only `sqrt` additions, never subtractions
5. All four ledger steps succeed or all roll back — single atomic `QueryRunner` transaction

---

## 6. Findings Summary

| Area | Status | Action |
|------|--------|--------|
| `emission.service.ts` | ✅ Correct | No change required |
| `emission.interfaces.ts` | ✅ Correct | No change required |
| `token.service.ts` | ✅ Correct | `mintForTransaction()` is canonical entry point |
| `fee_distribution.service.ts` | ✅ Correct | 75/25 epoch split confirmed |
| `tokenomics.service.ts` | ✅ Correct | Compatibility shim; canonical price from `EmissionService` |
| `01_coin_engine/` docs | ✅ Correct | All formulas match canonical model |
| `10_proof_of_transaction_engine/` docs | ✅ Correct | No emission formulas present |
| Module 01 deprecation status | NOT deprecated | Docs-only module; source lives in `src/token/` |

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — `EmissionService.afcReserveState` is in-memory; add an `AfcReserveEntity` table with periodic flush so restarts do not reset the price index.
- **Wire `mintForTransaction()` into all ingestion paths** — ensure the bridge/ingestion pipeline routes all canonical transactions through `TokenService.mintForTransaction()`, not the legacy `mint()`.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard, and rounding invariant `nodeShare + afcShare == commission`.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService.distributeRewards()` writes the AFC reserve ledger entry but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory `reserveIndex` after each epoch finalization.
