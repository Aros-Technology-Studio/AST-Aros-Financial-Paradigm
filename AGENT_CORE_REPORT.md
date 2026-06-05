# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-7LoiM`  
**Date:** 2026-06-05  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Full Mermaid sequence diagram + canonical formulas |
| `payment_distribution.md` | ✅ Canonical 75/25 split; historical note on old 60/15/15/5/5 model |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; burn-on-withdrawal policy |
| `AROS_Coin_TokenSpec.json` | ✅ Machine-readable spec |

**Conclusion:** Module 01 is pure documentation — no code, not deprecated. All documents are aligned with the canonical model. No changes required.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains PoT spec files (validation, slashing, signature model, weighting, incentive distribution).  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct by design.

### src/token/ — Status: Canonical code confirmed correct (gaps fixed in this pass)

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly defined |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve` made public (see §3) |
| `emission.service.spec.ts` | ✅ **NEW** — 16 unit tests covering calculate(), updateAfcReserve(), processTransactionEmission() |
| `token.service.ts` | ✅ `mintForTransaction()` is canonical entry point; legacy `mint()` retained for FIAT_DEPOSIT path |
| `tokenomics.service.ts` | ✅ **FIXED** — `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Fixed in this pass

| File | Status |
|------|--------|
| `fee_distribution.service.ts` | ✅ **FIXED** — now injects `EmissionService` and calls `updateAfcReserve()` after epoch AFC distribution |

### src/proof_of_transaction_engine/ — Status: Unchanged, correct

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy log1p-based volume index; still used by `TokenService.mint/burn()` for volume recording |
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
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC syncs price index | Yes | ✅ **FIXED** — `emissionService.updateAfcReserve()` called after epoch distribution |
| Single canonical price source | Yes | ✅ **FIXED** — `TokenomicsService.getCurrentPrice()` → `EmissionService` |

---

## 3. Changes Made in This Pass

### 3.1 `src/token/emission.service.ts` — `updateAfcReserve` visibility

**Before:** `private updateAfcReserve(afcAmount: number): void`  
**After:** `updateAfcReserve(afcAmount: number): void` (public)

**Why:** `FeeDistributionService` needed to sync the in-memory AFC reserve index after epoch-level fee distribution. The method is a clean domain operation, not an implementation detail.

---

### 3.2 `src/token/tokenomics.service.ts` — Unified price source

**Before:** `getCurrentPrice()` used `ProcessReserveLedgerService.getReserveState().reserveIndex`  
(log1p-based formula — separate from canonical EmissionService index)

**After:** `getCurrentPrice()` delegates to `EmissionService.getCurrentEmissionPrice()`  
(canonical sqrt-based formula — single source of truth)

**Why:** There were two independent price indices in the system. `ProcessReserveLedgerService` uses `log1p(volume) / 100` while `EmissionService` uses the canonical `1.0 + sqrt(totalAfcReserve) / 10_000`. Any caller using `tokenomicsService.getCurrentPrice()` was silently getting the wrong (non-canonical) value.

---

### 3.3 `src/fee_distribution/fee_distribution.service.ts` — Epoch AFC sync

**Added:** After recording the 25% AFC share on the ledger, `distributeRewards()` now calls:
```typescript
this.emissionService.updateAfcReserve(afcReserve);
```

**Why:** Per-TX emissions updated the EmissionService in-memory AFC index, but epoch-level fees were only written to the ledger — the in-memory index (and therefore the price) was never updated for epoch contributions. This meant the canonical `reserveIndex` understated the true accumulated reserve after epoch finalization.

---

### 3.4 `src/token/emission.service.spec.ts` — NEW unit test suite (16 tests)

Covers all canonical invariants:

| Test Group | Tests |
|------------|-------|
| `calculate()` | 1:1 emission, 0.5% default rate, 75/25 split, custom rate, zero/negative guard, dust amounts |
| `getAfcReserveState()` | Initial state (index=1.0, reserve=0, count=0) |
| `updateAfcReserve()` | Monotonic growth, sqrt formula verification, non-decreasing property |
| `getCurrentEmissionPrice()` | Initial 1.0, rises after accumulation |
| `processTransactionEmission()` | 4 ledger steps executed, rollback on failure |

All 16 tests pass (confirmed by `./node_modules/.bin/jest emission.service.spec --no-coverage`).

---

## 4. Emission Lifecycle — Confirmed Architecture

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
       → net circulating supply change = 0
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

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

## 6. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 7. Invariants (All Confirmed)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing — only increases, never decreases
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. `TokenomicsService.getCurrentPrice()` and `EmissionService.getCurrentEmissionPrice()` return identical values (single source)

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Maximum commission rate governance** — `updateCommissionRate()` allows any value in (0,1); consider tightening the bounds (e.g. max 5%) per governance policy.
