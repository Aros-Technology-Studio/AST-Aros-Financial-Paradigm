# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-dner1a`  
**Date:** 2026-06-14  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation

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
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Fixed in this pass

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75% node pool, 25% AFC reserve per epoch finalization |
| `fee_distribution.service.ts` → `EmissionService` injection | ✅ **FIXED**: epoch AFC share now updates in-memory `reserveIndex` via `emissionService.updateAfcReserve()` |

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
| Epoch AFC fees update price index | Yes | ✅ **FIXED** — `emissionService.updateAfcReserve(afcReserve)` called after ledger entry |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted == totalBurned` per cycle |

**Result: Code FULLY MATCHES canonical model.**

---

## 3. Changes Applied in This Pass

### Fix: Epoch AFC reserve not updating in-memory price index

**Problem (Issue #4 from prior audit):** `FeeDistributionService.distributeRewards()` was recording the 25% AFC portion on the ledger but NOT calling `EmissionService.updateAfcReserve()`, so the in-memory `reserveIndex` never reflected epoch-level fee accumulation. The emission price index was only updated by per-transaction emissions, not epoch finalization fees.

**Files changed:**

1. `src/token/emission.service.ts` — `updateAfcReserve()` changed from `private` to public (with doc comment).

2. `src/fee_distribution/fee_distribution.service.ts`:
   - Injected `EmissionService` via constructor (already available through `TokenModule` which `FeeDistributionModule` imports — no circular dependency).
   - Added `this.emissionService.updateAfcReserve(afcReserve)` call immediately after the AFC ledger entry in `distributeRewards()`.

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
  ├─ updateAfcReserve(afcShare):         ← also called by FeeDistributionService at epoch end
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
6. Epoch fee AFC accumulation also updates `reserveIndex` (fix applied 2026-06-14)

---

## 7. Open Issues (carry-forward, not blocking)

| # | Issue | Priority |
|---|-------|----------|
| 1 | `AfcReserveState` is in-memory — lost on restart. Add `AfcReserveEntity` table with periodic snapshots. | Medium |
| 2 | `IngestionService.ingestAsset()` has `tokenService.mint()` commented out. When activated, should call `mintForTransaction()` instead of `mint()`. | Medium |
| 3 | No unit tests for `EmissionService.calculate()` — cover dust amounts, max commission rate, zero-amount guard. | Low |

---

## 8. Audit History

| Date | Branch | Action |
|------|--------|--------|
| 2026-05-12 | `claude/inspiring-cannon-4qbjK` | Initial alignment — replaced load-index formula with canonical 1:1 in docs; implemented `EmissionService` |
| 2026-06-13 | `claude/inspiring-cannon-7sksc6` | Full audit pass — confirmed canonical compliance; merged via PR #243 |
| 2026-06-14 | `claude/inspiring-cannon-dner1a` | Fix: epoch AFC reserve now syncs in-memory price index via `EmissionService.updateAfcReserve()` |
