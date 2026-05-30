# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-41H3C`  
**Date:** 2026-05-30  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow; mermaid sequence diagram |
| `payment_distribution.md` | ✅ 75% nodes / 25% AFC reserve split |
| `burn_and_mint_rules.md` | ✅ Burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
No emission logic here. Actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Canonical emission code

| File | Status | Notes |
|------|--------|-------|
| `emission.interfaces.ts` | ✅ Correct | `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Correct | Full canonical 1:1 lifecycle |
| `emission.service.spec.ts` | ✅ Added | Unit tests (this pass) |
| `token.service.ts` | ✅ Correct | `mintForTransaction()` delegates to `EmissionService` |
| `tokenomics.service.ts` | ✅ Fixed | `getCurrentPrice()` now delegates to `EmissionService` (this pass) |
| `token.module.ts` | ✅ Correct | `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Canonical

| File | Status |
|------|--------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Unchanged (legacy roles only)

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Tracks cumulative process volume; `reserveIndex` via `log1p` — legacy, no longer used as price source |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code State |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Commission = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| `TokenomicsService.getCurrentPrice()` returns canonical price | Yes | ✅ Fixed: now delegates to `EmissionService.getCurrentEmissionPrice()` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

---

## 3. Divergence Found and Fixed (this pass)

### Problem: `TokenomicsService.getCurrentPrice()` used non-canonical formula

**Before:**
```typescript
// tokenomics.service.ts
constructor(private readonly processReserve: ProcessReserveLedgerService) {}

getCurrentPrice(): number {
    const state = this.processReserve.getReserveState();
    return state.reserveIndex; // 1.0 + log1p(totalProcessVolume) / 100  ← NON-CANONICAL
}
```

`ProcessReserveLedgerService` uses `log1p(totalProcessVolume)/100` — a different formula on a different input (`totalProcessVolume`, not `totalAfcReserve`).

**After:**
```typescript
// tokenomics.service.ts
constructor(private readonly emissionService: EmissionService) {}

getCurrentPrice(): number {
    return this.emissionService.getCurrentEmissionPrice();
    // = 1.0 + sqrt(totalAfcReserve) / 10_000  ← CANONICAL
}
```

Now there is a **single source of truth** for emission price: `EmissionService.afcReserveState.reserveIndex`.

---

## 4. Canonical Emission Flow (confirmed)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount              // 1:1
  │    commission     = txAmount × rate       // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT

All four ledger steps execute atomically (QueryRunner transaction).
```

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
  → every subsequent emission priced at this higher index
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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. `TokenomicsService.getCurrentPrice()` and `EmissionService.getCurrentEmissionPrice()` always return the same value (single source of truth)

---

## 8. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/tokenomics.service.ts` | Fixed `getCurrentPrice()` to delegate to `EmissionService`; removed `ProcessReserveLedgerService` dependency |
| `src/token/emission.service.spec.ts` | Created — 18 unit tests covering `calculate()`, AFC reserve, `processTransactionEmission()`, `updateCommissionRate()` |
| `AGENT_CORE_REPORT.md` | Updated with current findings |

---

## 9. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots per epoch.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in bridge/ingestion path with the canonical entry point.
- **Sync epoch AFC to `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
