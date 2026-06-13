# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-bq1xrb`  
**Date:** 2026-06-13  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | Describes 1:1 emission, 75/25 split, AFC reserve index formula |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram of full lifecycle; all formulas correct |
| `payment_distribution.md` | ✅ Canonical | 75/25 split table; historical note about old 60/15/15/5/5 model |
| `burn_and_mint_rules.md` | ✅ No conflicts | General burn-on-withdrawal policy; no 1:1 contradictions |
| `README.md` | ✅ No conflicts | Architecture overview; references canonical `EmissionService` |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic resides here.

---

### src/token/ — Status: Canonical code confirmed ✅

| File | Verified State |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all canonical |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge/fiat flows |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` proxies `ProcessReserveLedgerService`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

### src/fee_distribution/ — Status: Canonical ✅

| File | Verified State |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75% node pool / 25% AFC reserve per epoch — matches canonical model |

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

### src/integration/ingestion/ — Status: Fixed in this run

| File | Pre-patch | Action |
|------|-----------|--------|
| `ingestion.service.ts` | `TokenService` not injected; `mint()` call was commented out | **Wired** `TokenService.mintForTransaction()` as canonical entry point |
| `ingestion.module.ts` | No `TokenModule` import | **Added** `forwardRef(() => TokenModule)` import |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Ingestion pipeline uses canonical emission | Yes | ✅ **Fixed** — `mintForTransaction()` now called from `IngestionService` |

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

## 6. Changes Made in This Run

| File | Change |
|------|--------|
| `src/integration/ingestion/ingestion.service.ts` | Injected `TokenService`; replaced commented `mint()` with `mintForTransaction()` |
| `src/integration/ingestion/ingestion.module.ts` | Added `forwardRef(() => TokenModule)` import |
| `src/token/emission.service.spec.ts` | **New** — unit tests for `calculate()` (zero guard, 1:1, 75/25 split, custom rate, dust amounts) and AFC reserve price index monotonicity |

---

## 7. Outstanding Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Sync epoch AFC to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory price index does not include epoch-level contributions. Consider calling `EmissionService.updateAfcReserve(afcReserve)` after each epoch finalization.
- **Deprecate `TokenService.mint()`** in the bridge/fiat path once all callers are migrated to `mintForTransaction()`.
