# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-GXVTA`  
**Date:** 2026-05-14  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or rewrite, deliver tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only, canonical ✅

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example — correct |
| `aro_emission_protocol.md` | ✅ Canonical protocol with Mermaid flow diagram — correct |
| `payment_distribution.md` | ✅ 75/25 split; historical note on prior 60/15/15/5/5 — correct |
| `burn_and_mint_rules.md` | ✅ Non-contradictory — left as-is |
| `README.md` | ✅ Architecture overview — left as-is |

**Module 01 is NOT deprecated** — pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only, no emission logic

Contains `.md` spec files for PoT validation, slashing, weighting, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. **No emission logic here.**

### src/token/ — Status: Canonical code, confirmed correct, gaps closed

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `addToAfcReserve()` now public |
| `emission.service.spec.ts` | ✅ **NEW — 26 unit tests covering all canonical invariants** |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; `mint()` preserved as legacy |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a confirmed deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Gap closed ✅

| File | Change |
|------|--------|
| `fee_distribution.service.ts` | **FIXED** — now injects `EmissionService` and calls `addToAfcReserve()` after epoch AFC recording |
| `fee_distribution.service.test.ts` | **UPDATED** — `EmissionService` mock added to test module |

### src/proof_of_transaction_engine/ — Status: Correct, untouched

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics only |
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
| Epoch AFC syncs price index | **WAS MISSING** | ✅ **FIXED** — `emissionService.addToAfcReserve()` called after epoch |

---

## 3. Changes Made in This Session

### 3.1 `src/token/emission.service.ts`

`updateAfcReserve()` renamed to `addToAfcReserve()` and made **public**.  
Reason: `FeeDistributionService` needs to call it after each epoch finalization to keep the  
in-memory `reserveIndex` consistent with accumulated epoch-level AFC fees.

### 3.2 `src/fee_distribution/fee_distribution.service.ts`

- Injected `EmissionService` into the constructor.
- Added call to `this.emissionService.addToAfcReserve(afcReserve)` in `distributeRewards()`  
  immediately after recording the epoch AFC ledger entry.

**Before (gap):**
```
distributeRewards():
  → records AFC reserve ledger transaction
  // ← price index NOT updated
```

**After (fixed):**
```
distributeRewards():
  → records AFC reserve ledger transaction
  → this.emissionService.addToAfcReserve(afcReserve)  // index rises
```

### 3.3 `src/token/emission.service.spec.ts` (new file — 26 tests)

Covers all canonical invariants:

| Test group | Tests |
|------------|-------|
| `calculate()` | 1:1 invariant, default rate, custom rate, commission split, zero/negative guard, dust amounts |
| `getAfcReserveState()` | Initial state, immutable snapshot |
| `getCurrentEmissionPrice()` | Initial = 1.0, rises after reserve update |
| `addToAfcReserve()` | Monotonic rise, sqrt formula, transactionCount |
| `updateCommissionRate()` | Rate change takes effect, rejects invalid values |
| `processTransactionEmission()` | 4-step ledger order, MINT=1:1, 75/25 split, BURN=emission, commit on success, rollback on error, price update |

### 3.4 `src/fee_distribution/fee_distribution.service.test.ts` (updated)

Added `EmissionService` import and `mockEmissionService` (`addToAfcReserve: jest.fn()`) to the test  
module provider list so the `FeeDistributionService` constructor resolves correctly.

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
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ addToAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT

FeeDistributionService.distributeRewards(epoch, fees, weights)
  │
  ├─ nodePool   = fees × 0.75  → per-node by PoT weight
  ├─ afcReserve = fees × 0.25  → AFC reserve ledger entry
  └─ emissionService.addToAfcReserve(afcReserve)  ← epoch price sync (NEW)
```

All four per-TX ledger operations execute atomically within a single `QueryRunner` transaction.

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
6. Epoch-level AFC fees now also advance `reserveIndex` (gap closed this session)

---

## 7. Test Results

```
PASS src/token/emission.service.spec.ts
  EmissionService — 26 tests, 0 failures

PASS src/fee_distribution/fee_distribution.service.test.ts
  FeeDistributionService — 3 tests, 0 failures
```

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — in-memory state is lost on restart. Add an
  `AfcReserveEntity` table with a snapshot saved after each `addToAfcReserve()` call.
- **Wire `mintForTransaction()` into ingestion pipeline** — `IngestionService.ingestAsset()` has a
  commented-out `tokenService.mint()` stub. Replace with `tokenService.mintForTransaction()` when
  the ingestion pipeline is fully wired.
- **Add integration test for epoch AFC → price index flow** — verify that after
  `FeeDistributionService.finalizeEpoch()`, `EmissionService.getCurrentEmissionPrice()` returns
  a value higher than 1.0.
