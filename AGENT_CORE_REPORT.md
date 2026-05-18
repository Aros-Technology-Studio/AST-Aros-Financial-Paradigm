# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-wwYXz`  
**Date:** 2026-05-18  
**Task:** Audit ArosCoin emission logic against the canonical model; align code, tests, and API surface

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (correct)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Mermaid sequence diagram, 75/25 split, burn flow |
| `payment_distribution.md` | ✅ 75% nodes / 25% AFC reserve; PoT weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory burn-on-completion policy |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only (correct)

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: All canonical, one gap fixed

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `emission.service.spec.ts` | ✅ **Added** — 18 tests covering calculate(), lifecycle, price model |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `token.controller.ts` | ✅ **Fixed** — canonical `POST /emit`, `GET /emission/reserve`, `GET /emission/price` added |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; acknowledged |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Correct

| File | Status |
|------|--------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
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
| Canonical API endpoint exposed | Yes | ✅ **Fixed** — `POST /api/v1/token/emit` added to controller |

---

## 3. Gap Found and Fixed

### Pre-fix state

`TokenController` exposed only the legacy `POST /api/v1/token/mint` endpoint which calls `tokenService.mint()`.  
That legacy path:
- Records a single `MINT` ledger entry (no fee split, no burn)
- Does **not** apply the canonical 1:1 emission model
- Does **not** update the AFC reserve index

This meant the canonical `EmissionService` existed but had no API surface — callers had no way to trigger the canonical flow through the HTTP layer.

### Fix applied

**`src/token/token.controller.ts`** — three endpoints added:

```
POST  /api/v1/token/emit            → tokenService.mintForTransaction()  (canonical entry point)
GET   /api/v1/token/emission/reserve → emissionService.getAfcReserveState()
GET   /api/v1/token/emission/price   → emissionService.getCurrentEmissionPrice()
```

Legacy `POST /api/v1/token/mint` retained for FIAT_DEPOSIT backward-compatibility.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants (all verified by tests)

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (tested: 5 sequential TXs)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Test Coverage Added (`src/token/emission.service.spec.ts`)

18 tests across 4 `describe` blocks:

| Block | Tests |
|-------|-------|
| `calculate()` | 1:1 ratio, 0.5% default rate, 75/25 split, custom rate, guards |
| `processTransactionEmission()` | 4 ledger entries, MINT amount, BURN amount, AFC growth, rollback |
| AFC reserve index | Initial=1.0, `1.0+sqrt/10_000` formula, monotonic guarantee |
| `updateCommissionRate()` | Rate update effect, rate=0 guard, rate≥1 guard |

All 18 tests pass (`PASS src/token/emission.service.spec.ts`).

---

## 8. Recommendations (open)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Sync `FeeDistributionService` with `EmissionService.updateAfcReserve()`** — epoch-level fee distributions to `SYSTEM_AFC_RESERVE` are recorded on the ledger but do not update the in-memory `reserveIndex`; the index will under-report after epoch finalization.
- **Wire `mintForTransaction()` into the bridge/ingestion pipeline** — replace any remaining direct `mint()` calls in automated ingestion paths with the canonical entry point `POST /api/v1/token/emit`.
