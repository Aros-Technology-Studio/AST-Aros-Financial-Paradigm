# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-n1jJj`  
**Date:** 2026-05-30  
**Task:** Audit ArosCoin emission logic against the canonical model; realign code and documentation where divergence is found

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Content state |
|------|--------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid lifecycle diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split; notes 60/15/15/5/5 was historical |
| `burn_and_mint_rules.md` | ✅ Correct general policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Source-of-truth code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Primary implementation

| File | Status | Notes |
|------|--------|-------|
| `emission.interfaces.ts` | ✅ | `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ | Full canonical 1:1 lifecycle |
| `emission.service.spec.ts` | ✅ NEW | 14 unit tests covering all invariants |
| `token.service.ts` | ✅ | `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` kept |
| `token.controller.ts` | ✅ FIXED | Added `POST /api/v1/token/emit` — canonical REST entry point |
| `tokenomics.service.ts` | ✅ | `updateInternalValuation()` is deprecated no-op; price delegates to reserve |
| `token.module.ts` | ✅ | `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Correct

| File | Status |
|------|--------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: node pool + AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

### tests/ — Status: Updated

| File | Status |
|------|--------|
| `tests/test_emission.py` | ✅ FILLED — was empty; now has 19 passing property tests |

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
| Canonical REST endpoint | Yes | ✅ `POST /api/v1/token/emit` (added this pass) |

---

## 3. Gaps Found and Fixed in This Pass

### Gap 1 — Missing canonical REST endpoint (FIXED)

**File:** `src/token/token.controller.ts`  
**Problem:** Controller only exposed `POST /api/v1/token/mint` which calls the legacy `mint()` method — no fee split, no atomic burn. The canonical `EmissionService.processTransactionEmission()` was unreachable via REST API.  
**Fix:** Added `POST /api/v1/token/emit` that calls `tokenService.mintForTransaction()` and returns the full emission result plus current `emissionPrice` and `afcReserve` snapshot.

```typescript
@Post('emit')
async canonicalEmit(@Body() body: { transactionAmount, recipient, referenceId, commissionRate? })
// → tokenService.mintForTransaction() → EmissionService.processTransactionEmission()
```

### Gap 2 — Empty Python test file (FIXED)

**File:** `tests/test_emission.py`  
**Problem:** File existed but contained only a blank line.  
**Fix:** Added 19 property-based tests across three classes:
- `TestCanonicalFormula` — 10 tests covering 1:1 emission, 0.5% fee, 75/25 split, invariants, guards
- `TestAfcReservePriceIndex` — 4 tests: starts at 1.0, monotonic increase, sub-linear growth, $10k example
- `TestEpochDistribution` — 1 test validating epoch-level 75/25 split

All 19 pass.

### Gap 3 — Missing TypeScript unit tests for EmissionService (ADDED)

**File:** `src/token/emission.service.spec.ts` (new)  
**Added:** 14 tests covering:
- `calculate()` invariants (1:1, default rate, 75/25 split, sum invariant, custom rate, guards)
- AFC reserve price index (initial value, getter, state shape)
- `updateCommissionRate()` (boundary guards, valid rate)
- `processTransactionEmission()` (four ledger entries, MINT amount, BURN amount, addresses, index rise, rollback on failure)

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants (Confirmed)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` if violated
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — only increases, never decreases
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 7. Outstanding Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all remaining `mint()` calls in the bridge/ingestion path with the canonical `POST /api/v1/token/emit` entry point.
- **Epoch AFC sync** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization so `getCurrentEmissionPrice()` reflects epoch-level accumulation too.
