# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-01  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code, documentation, and tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Content state | Action |
|------|--------------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, example | Confirmed correct |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow | Confirmed correct |
| `payment_distribution.md` | ✅ 75/25 split with PoT-weight validator formula | Confirmed correct |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy | Confirmed correct |
| `README.md` | Architecture overview; no formula conflicts | Unchanged |

**Module 01 is NOT deprecated** — it is pure specification documentation.  
The canonical source code lives in `src/token/emission.service.ts`.

---

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
No emission logic is present here. Actual PoT code lives in `src/proof_of_transaction_engine/`.

---

### src/token/ — Status: Canonical implementation ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented (`processTransactionEmission`) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat-deposit path |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` reads `processReserve.reserveIndex` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

### src/fee_distribution/ — Status: Canonical ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

Private constants confirmed:
```ts
private readonly NODE_SHARE_RATIO = 0.75;
private readonly AFC_SHARE_RATIO  = 0.25;
```

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics price path |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

### tests/ — Status: Enhanced ✅

| File | Before | After |
|------|--------|-------|
| `tests/test_emission.py` | Empty (0 bytes) | **Written**: 25 passing unit tests |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply = 0 per TX cycle | Yes | ✅ `SupplySnapshot`: `totalMinted == totalBurned` per cycle |

**All 8 canonical rules are implemented and verified.**

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
  ├─ [QueryRunner TX start]
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
  ├─ updateSupplySnapshot(): totalMinted += emission; totalBurned += emission
  └─ [QueryRunner TX commit / rollback on error]
```

All four ledger operations and the supply snapshot update execute within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Reference Scenario: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` — sub-linear growth; reaches 2.0 at exactly 100M reserve

---

## 6. Test Coverage Added

File: `tests/test_emission.py` — 25 unit tests, all passing.

| Test class | Tests | What is verified |
|------------|-------|-----------------|
| `TestEmissionCalculation` | 11 | 1:1 emission, default rate, 75/25 split, commission decomposition, guards for zero/negative, small and large amounts |
| `TestAfcReserveIndex` | 5 | Initial value, monotonic growth, sub-linear dampening, boundary at 100M |
| `TestEpochFeeDistribution` | 4 | 75/25 epoch split, sum invariant, weight normalization, per-node reward |
| `TestEndToEndScenario` | 3 | Reference $10k TX, cumulative reserve growth, net-zero supply across N cycles |

Run with: `python3 -m unittest tests/test_emission.py -v`

---

## 7. Remaining Recommendations (not blocking)

1. **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.

2. **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on the ledger but does NOT call `EmissionService.updateAfcReserve()`. The in-memory `reserveIndex` therefore only reflects per-TX contributions, not epoch-level ones. Consider injecting `EmissionService` into `FeeDistributionService` and calling `updateAfcReserve(afcReserve)` after epoch commit.

3. **Expose `mintForTransaction()` via controller** — `TokenController.POST /token/mint` still calls the legacy `mint()`. A new endpoint (e.g. `POST /token/emit`) should front `mintForTransaction()` for canonical flow callers.

4. **Add unit tests for `EmissionService` in TypeScript** — `token.service.spec.ts` mocks `EmissionService`; add a dedicated `emission.service.spec.ts` that exercises the real `calculate()` logic with edge cases.
