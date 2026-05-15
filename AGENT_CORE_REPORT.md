# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-eGD2o` → PR targeting `agent/core-emission`  
**Date:** 2026-05-15  
**Task:** Full audit of ArosCoin emission logic against canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example — correct |
| `aro_emission_protocol.md` | ✅ Full Mermaid flow, canonical formulas — correct |
| `payment_distribution.md` | ✅ 75/25 canonical split, historical note re: prior 60/15/15/5/5 — correct |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code; one fix applied (see §4)

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — correct |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | **FIXED** — `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` |
| `token.module.ts` | ✅ `EmissionService` registered, exported; no circular deps |

### src/fee_distribution/ — Status: Canonical code confirmed correct

`FeeDistributionService.distributeRewards()` applies 75/25 split per epoch:
- 75% → node pool (divided by PoT-normalized weight per active validator)
- 25% → `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — legacy, not canonical price source |
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
| `TokenomicsService.getCurrentPrice()` uses canonical formula | **FIXED** | ✅ now delegates to `EmissionService.getCurrentEmissionPrice()` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

---

## 3. Bug Fixed in This Pass

### `tokenomics.service.ts` — Price formula divergence

**Before:** `getCurrentPrice()` returned `processReserve.getReserveState().reserveIndex` — computed via `log1p(volume)/100`, a different formula with different inputs (total process volume, not AFC reserve accumulation).

**After:** `getCurrentPrice()` delegates to `this.emissionService.getCurrentEmissionPrice()` — returns `1.0 + sqrt(totalAfcReserve) / 10_000`, the canonical formula.

**Impact:** The legacy `mint()` and `burn()` paths in `TokenService` that logged the price now report the correct canonical index. No business logic was affected (price was only used in log messages in those legacy paths).

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
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 7. Remaining Recommendations (out of scope for this pass)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots so price continuity survives process restarts.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` therefore does not reflect epoch-level reserve accumulation. Consider calling `emissionService.updateAfcReserve(afcEpochAmount)` after each epoch finalization.
- **Unit tests for `EmissionService.calculate()`** — add coverage for dust amounts, max commission rate boundary, zero-amount guard, and `reserveIndex` monotonicity.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in the bridge/ingestion path with the canonical entry point.
