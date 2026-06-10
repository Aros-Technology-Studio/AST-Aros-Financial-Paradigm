# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-wgih0g`  
**Date:** 2026-06-10  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State | Notes |
|------|-------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC reserve index, example — fully aligned |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram, 75/25 split, burn flow |
| `payment_distribution.md` | ✅ Canonical | 75% nodes / 25% AFC, PoT weight formula |
| `burn_and_mint_rules.md` | ✅ Consistent | General burn policy; no conflicts |
| `README.md` | ✅ Consistent | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code verified and corrected

| File | State | Notes |
|------|-------|-------|
| `emission.interfaces.ts` | ✅ Correct | `EmissionResult`, `EmissionConfig`, `AfcReserveState` interfaces |
| `emission.service.ts` | ✅ Correct | Full canonical 1:1 lifecycle — see §3 |
| `token.service.ts` | ✅ Correct | `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` for fiat bridge only |
| `tokenomics.service.ts` | ✅ **Fixed** | `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` |
| `token.module.ts` | ✅ Correct | `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code verified correct

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75% node pool / 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy process volume ledger; `reserveIndex` via `log1p` — used only for legacy `burn()` path |
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
| Price index: canonical formula everywhere | Yes | ✅ **Fixed** — `TokenomicsService.getCurrentPrice()` now uses `EmissionService` |

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
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot():
       totalMinted += emissionAmount
       totalBurned += emissionAmount
       circulatingSupply unchanged (net zero)
```

All five ledger/snapshot steps execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Fix Applied This Pass

### Problem: Dual price index discrepancy

**Before fix:** `TokenomicsService.getCurrentPrice()` called `ProcessReserveLedgerService.getReserveState().reserveIndex`, which uses `log1p` formula and a different accumulator (total process volume vs AFC reserve).

**After fix:** `TokenomicsService.getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()`, which uses the canonical `1.0 + sqrt(totalAfcReserve) / 10_000` formula.

**File changed:** `src/token/tokenomics.service.ts`

```diff
-    getCurrentPrice(): number {
-        const state = this.processReserve.getReserveState();
-        return state.reserveIndex;
-    }
+    getCurrentPrice(): number {
+        return this.emissionService.getCurrentEmissionPrice();
+    }
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
  → every subsequent emission is priced higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+=` to `totalReserve`)
5. All ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. `getCurrentPrice()` is consistent — both `TokenomicsService` and `EmissionService` return the same value

---

## 7. Remaining Recommendations

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots. |
| MEDIUM | **Wire `mintForTransaction()` into all ingestion paths** — replace any remaining `mint()` calls in bridge/ingestion with the canonical entry point. |
| MEDIUM | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard. |
| LOW | **Sync AFC reserve from epoch finalization** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory price index stays unaware of epoch contributions until process restart. |
