# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-18 (Pass 5 — verification audit)  
**Task:** Audit ArosCoin emission logic against the canonical model, align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical sequence diagram, 75/25 split, burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split, validator weight formula |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy, non-contradictory |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation fixed (Pass 1)

| File | Pre-patch | Action |
|------|-----------|--------|
| `pot_tx_incentive_distribution.md` | ❌ `60% validators / 30% attesters / 10% burn` — diverged from canonical 75/25 | **Fixed** → canonical `75% node pool / 25% AFC reserve` |
| All other `.md` files | ✅ No emission formulas | Left as-is |

### src/token/ — Canonical code

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle. `addAfcReserve()` public method added (Pass 2) |
| `emission.service.spec.ts` | ✅ **NEW** (Pass 1) — 25 Jest unit tests covering all canonical invariants |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | **FIXED (Pass 2)** — `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` (was using non-canonical log1p formula) |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | **FIXED (Pass 4)** — `POST /mint` now calls `mintForTransaction()` (canonical); `GET /emission/state` added |

### src/fee_distribution/ — Status

| File | State |
|------|-------|
| `fee_distribution.service.ts` | **FIXED (Pass 2)** — `distributeRewards()` now calls `emissionService.addAfcReserve()` to sync in-memory price index after epoch settlement |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Volume ledger for legacy analytics; `reserveIndex` via `log1p` — no longer used for canonical price |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

### tests/ — Status: tests added (Pass 1)

| File | Action |
|------|--------|
| `tests/test_emission.py` | **Written** — 22 deterministic Python reference tests |

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
| Epoch AFC fees update price index | Yes | **FIXED (Pass 2)** — `emissionService.addAfcReserve()` called post-epoch |
| `getCurrentPrice()` returns canonical formula | Yes | **FIXED (Pass 2)** — delegates to `emissionService.getCurrentEmissionPrice()` |
| Controller routes canonical | Yes | **FIXED (Pass 4)** — `POST /mint` calls `mintForTransaction()` |
| Net circulating supply change per TX cycle | 0 | ✅ `totalMinted += emission`, `totalBurned += emission` → net zero |

---

## 3. Issues Found and Fixed (Pass 2)

### Issue 1 — `TokenomicsService.getCurrentPrice()` used wrong formula

**Pre-fix:** Returned `processReserve.getReserveState().reserveIndex`, calculated as
`1.0 + log1p(totalProcessVolume) / 100`. This uses:
- A different formula (log1p/100 vs canonical sqrt/10_000)
- A different underlying variable (total tx volume vs AFC reserve balance)

At 100 units of input the divergence is stark:
- Legacy formula: `1.0 + log1p(100)/100 ≈ 1.046`
- Canonical formula: `1.0 + sqrt(100)/10_000 = 1.001`

**Fix:** `TokenomicsService` now injects `EmissionService` and `getCurrentPrice()` returns
`this.emissionService.getCurrentEmissionPrice()`.

### Issue 2 — Epoch AFC fees did not update `EmissionService` in-memory state

**Pre-fix:** `FeeDistributionService.distributeRewards()` recorded the epoch AFC contribution
on the ledger but did NOT call `EmissionService.updateAfcReserve()`. The in-memory
`afcReserveState` (which drives `reserveIndex`) was updated only per individual transaction.
Epoch-level fees had zero effect on the emission price index — explicitly listed as a
remaining recommendation in the previous pass but not implemented.

**Fix:**
1. Added `public addAfcReserve(amount: number): void` to `EmissionService` — wraps the
   private `updateAfcReserve()` for external callers.
2. `FeeDistributionService.distributeRewards()` now injects `EmissionService` and calls
   `this.emissionService.addAfcReserve(afcReserve)` immediately after recording the AFC ledger entry.

---

## 4. Canonical Emission Lifecycle (Confirmed)

### EmissionService — `src/token/emission.service.ts`

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
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger steps execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch Finalization

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.addAfcReserve(afcReserve)   ← syncs price index
  └─ For each node: Ledger VALIDATOR_REWARD: nodePool × weight → nodeId
```

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

## 6. Invariants (All Verified)

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss)
3. `totalMinted == totalBurned` per canonical TX cycle (net zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. Epoch AFC fees update `reserveIndex` via `addAfcReserve()` — fixed Pass 2
7. `TokenomicsService.getCurrentPrice()` returns canonical sqrt-based index — fixed Pass 2
8. `POST /api/v1/token/mint` routes through `mintForTransaction()` — fixed Pass 4

---

## 7. All Changes

| File | Pass | Change |
|------|------|--------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | 1 | Fixed divergent 60/30/10 split → canonical 75/25 |
| `src/token/emission.service.spec.ts` | 1 | Created — 25 Jest unit tests for `EmissionService` |
| `tests/test_emission.py` | 1 | Created — 22 deterministic Python reference tests |
| `src/token/emission.service.ts` | 2 | Added `public addAfcReserve()` method for external callers |
| `src/token/tokenomics.service.ts` | 2 | `getCurrentPrice()` now delegates to `EmissionService` (canonical formula) |
| `src/fee_distribution/fee_distribution.service.ts` | 2 | Injects `EmissionService`; calls `addAfcReserve()` after epoch distribution |
| `src/token/token.service.spec.ts` | 3 | Added `mintForTransaction()` test suite (canonical entry point) |
| `src/token/token.controller.ts` | 4 | `POST /mint` calls `mintForTransaction()` (canonical); `GET /emission/state` added |
| `AGENT_CORE_REPORT.md` | 1+2+3+4 | This file |

---

## 8. Pass 4 — Controller Fix (2026-05-18)

**Purpose:** The REST controller `POST /api/v1/token/mint` called the legacy `TokenService.mint()`
which bypassed the canonical emission flow entirely — no commission calculation, no 75/25 split,
no AFC reserve update, no burn.

**Fix applied to `src/token/token.controller.ts`:**
- `POST /mint` now calls `mintForTransaction(parseFloat(amount), recipient, refId, commissionRate?)`
- `EmissionService` injected directly into the controller
- New `GET /emission/state` endpoint returns live AFC reserve state + current emission price index
- Removed stale inline comments from the settlement endpoint

This closes the final divergence between the HTTP API surface and the canonical 1:1 emission model.

---

## 9. Pass 5 — Verification Audit (2026-05-18)

**Purpose:** Full re-audit of the canonical emission model across all code and documentation.

**Audit result: ALL CLEAR — no deviations found.**

| Check | Result |
|-------|--------|
| `EmissionService.calculate()` — 1:1 emission | ✅ `emissionAmount = transactionAmount` |
| `EmissionService.calculate()` — fee formula | ✅ `commission = txAmount * 0.005` |
| `EmissionService.calculate()` — 75/25 split | ✅ `nodeShare = commission * 0.75`, `afcShare = commission * 0.25` |
| `EmissionService.processTransactionEmission()` — 4 atomic ledger steps | ✅ MINT → FEE×2 → BURN in `QueryRunner` |
| `EmissionService.updateAfcReserve()` — price index formula | ✅ `1.0 + sqrt(totalReserve) / 10_000` |
| `EmissionService.addAfcReserve()` — public epoch sync point | ✅ present |
| `TokenomicsService.getCurrentPrice()` — canonical formula | ✅ delegates to `emissionService.getCurrentEmissionPrice()` |
| `FeeDistributionService.distributeRewards()` — 75/25 epoch split | ✅ `nodePool = fees * 0.75`, `afcReserve = fees * 0.25` |
| `FeeDistributionService` — syncs EmissionService after epoch | ✅ `emissionService.addAfcReserve(afcReserve)` |
| `TokenController POST /mint` — routes to canonical path | ✅ calls `mintForTransaction()` |
| `TokenController GET /emission/state` — exposes live AFC state | ✅ present |
| `emission.service.spec.ts` — 25 Jest tests | ✅ all pass |
| `token.service.spec.ts` — tests for `mintForTransaction()` | ✅ all pass |
| `fee_distribution.service.test.ts` — 6 distribution tests | ✅ all pass |
| `tests/test_emission.py` — 22 Python reference tests | ✅ present |
| `01_coin_engine/coin_emission_model.md` — documentation | ✅ canonical 1:1 formulas |
| `01_coin_engine/aro_emission_protocol.md` — documentation | ✅ canonical sequence flow |
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | ✅ canonical 75/25 split |

**Test run summary (Pass 5):**
```
Test Suites: 3 passed, 3 total
Tests:       36 passed, 36 total
  - EmissionService: 25 tests
  - TokenService:     5 tests
  - FeeDistribution:  6 tests
```

---

## 10. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots and restore on boot.
- **Wire `mintForTransaction()` into ingestion pipeline** — `IngestionService.ingestAsset()` has legacy `mint()` commented out; should call `mintForTransaction()` for canonical flow.
- **Deprecate `TokenService.mint()`** — mark it `@deprecated`; all canonical traffic now flows through `mintForTransaction()`. The legacy path is still invoked by bridge fiat-deposit flows; those should be migrated.
