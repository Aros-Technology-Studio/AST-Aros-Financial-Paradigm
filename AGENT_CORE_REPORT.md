# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-j7i1kb`  
**Date:** 2026-06-14  
**Task:** Audit ArosCoin emission logic against the canonical model; fix all open issues

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; left as-is |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC update → burn (atomic) |
| `emission.service.spec.ts` | ✅ **NEW** — 13 unit tests covering calculate(), recordAfcContribution(), processTransactionEmission() |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat bridge flow |
| `token.controller.ts` | ✅ **NEW** `POST /api/v1/token/emit` canonical endpoint wired to `mintForTransaction()` |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Fixed this pass

| File | Change |
|------|--------|
| `fee_distribution.service.ts` | ✅ **FIXED** — `EmissionService` injected; `recordAfcContribution()` called after epoch AFC distribution |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Reserve volume ledger; `reserveIndex` via `log1p` — consumed by legacy `TokenomicsService` |
| `pot.service.ts` | PoT scoring and weight normalization — correct, untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` (`EmissionService.calculate()`) |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted == totalBurned` per cycle |
| AFC index updated on epoch fees | Yes | ✅ **FIXED** `EmissionService.recordAfcContribution()` called in epoch finalization |

**Result: Code FULLY MATCHES canonical model. All previous open issues resolved.**

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
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### New Public API — `EmissionService.recordAfcContribution(amount)`

Exposes the internal `updateAfcReserve` updater for external callers (e.g. `FeeDistributionService`)
so the in-memory `reserveIndex` stays consistent regardless of whether AFC contributions arrive
per-transaction or per-epoch.

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

---

## 6. Changes Made in This Pass (2026-06-14)

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added public `recordAfcContribution(afcAmount)` wrapper |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; call `recordAfcContribution()` after epoch AFC distribution |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` canonical emission endpoint |
| `src/token/emission.service.spec.ts` | Created 13 unit tests for `calculate()`, AFC index, and `processTransactionEmission()` |
| `AGENT_CORE_REPORT.md` | Updated with this audit pass |

---

## 7. Remaining Open Issues

| # | Issue | Priority |
|---|-------|----------|
| 1 | `AfcReserveState` is in-memory — lost on restart. Add `AfcReserveEntity` table with periodic snapshots. | Medium |
| 2 | `IngestionService.ingestAsset()` calls `TokenService.mint()` (commented out) — should call `mintForTransaction()` for canonical flow. | Low |
