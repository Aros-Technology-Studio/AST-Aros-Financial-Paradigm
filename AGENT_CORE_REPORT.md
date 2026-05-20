# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-oAUWP`  
**Date:** 2026-05-20  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, burn lifecycle |
| `aro_emission_protocol.md` | ✅ Canonical sequence diagram, 75/25 split, atomic burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split with PoT validator weight formula |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy; no contradictions |
| `README.md` | ✅ Architecture overview; consistent with canonical model |

Module 01 is pure documentation. The canonical source of truth is `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correct |
| `emission.service.ts` | ✅ Full 1:1 lifecycle; `addAfcContribution()` added (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` → `EmissionService`; legacy `mint()` retained |
| `tokenomics.service.ts` | **FIXED** — `getCurrentPrice()` now delegates to `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Canonical code

| File | Status |
|------|--------|
| `fee_distribution.service.ts` | **FIXED** — epoch AFC contribution now updates canonical price index |

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy volume ledger (log1p index); used by TokenService for volume tracking only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` atomically |
| AFC reserve → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC raises price index | Yes | ✅ **NOW FIXED** via `emissionService.addAfcContribution()` |
| Price index = AFC reserve index | Yes | ✅ **NOW FIXED** in `TokenomicsService.getCurrentPrice()` |

---

## 3. Gaps Found and Fixed in This Pass

### GAP 1 (FIXED): `TokenomicsService.getCurrentPrice()` returned wrong formula

**Before:** Delegated to `ProcessReserveLedgerService.getReserveState().reserveIndex`  
Formula: `1.0 + log1p(totalProcessVolume) / 100`  
This is the *transaction-volume* index, not the *AFC reserve* index.

**After:** Delegates to `EmissionService.getCurrentEmissionPrice()`  
Formula: `1.0 + sqrt(totalAfcReserve) / 10_000`  
This is the canonical AFC reserve price index.

**File changed:** `src/token/tokenomics.service.ts`

```ts
// Before (wrong index source)
getCurrentPrice(): number {
    const state = this.processReserve.getReserveState();
    return state.reserveIndex; // log1p of transaction volume
}

// After (canonical AFC reserve index)
getCurrentPrice(): number {
    return this.emissionService.getCurrentEmissionPrice(); // sqrt of AFC reserve
}
```

---

### GAP 2 (FIXED): Epoch-level AFC did not update the canonical price index

**Before:** `FeeDistributionService.distributeRewards()` recorded 25% AFC to the ledger  
but did NOT call `EmissionService.updateAfcReserve()`. The in-memory price index  
was only raised by per-TX emissions, not by epoch-level fee collection.

**After:** After recording the AFC ledger entry, the service now calls:
```ts
this.emissionService.addAfcContribution(afcReserve);
```
This triggers `updateAfcReserve()` in `EmissionService`, raising  
`reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` consistently.

**Files changed:**
- `src/token/emission.service.ts` — added `addAfcContribution(amount)` public method
- `src/fee_distribution/fee_distribution.service.ts` — injected `EmissionService`, added call
- `src/fee_distribution/fee_distribution.service.test.ts` — added `EmissionService` mock

---

## 4. Canonical Emission Lifecycle (Confirmed)

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
  │    reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT

All four ledger operations execute atomically within a single QueryRunner transaction.
```

Epoch-level flow:
```
FeeDistributionService.distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75  → distributed per PoT weight to each node
  ├─ afcReserve = totalFees × 0.25  → Ledger FEE_DISTRIBUTION → SYSTEM_AFC_RESERVE
  └─ emissionService.addAfcContribution(afcReserve)  ← NEW: updates canonical price index
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

reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
→ every subsequent emission is priced higher
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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing across both per-TX and epoch-level events
5. All four per-TX ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots and reload on startup.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point for full PoT compliance.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
