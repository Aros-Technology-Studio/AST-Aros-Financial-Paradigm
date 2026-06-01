# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-jU5If`  
**Date:** 2026-06-01  
**Task:** Audit ArosCoin emission logic against the canonical model, align all code and documentation, and add missing test coverage

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Pre-audit content | Action taken |
|------|------------------|--------------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index, worked example | ✅ Confirmed correct (aligned in PR #72) |
| `aro_emission_protocol.md` | Canonical 1:1 + 75/25 + burn flow with Mermaid sequence diagram | ✅ Confirmed correct |
| `payment_distribution.md` | Canonical 75/25 split with PoT validator weight formula | ✅ Confirmed correct |
| `burn_and_mint_rules.md` | Correct general burn-on-withdrawal policy | ✅ Left as-is (non-contradictory) |
| `README.md` | Architecture overview; no formula conflicts | ✅ Left as-is |

**Module 01 is NOT deprecated** — it is pure documentation. Source of truth lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution. Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here — no changes needed.

### src/token/ — Status after this audit

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ Correct — defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `emission.service.spec.ts` | ✅ **NEW** — 19 unit tests covering all canonical invariants |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat-deposit path |
| `token.controller.ts` | ✅ **UPDATED** — added `POST /api/v1/token/emit` canonical endpoint |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads AFC reserve index; `updateInternalValuation()` is a no-op stub |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Confirmed correct

`FeeDistributionService.distributeRewards()` applies canonical 75/25 split per epoch. No changes needed.

### tests/ — Status after this audit

| File | Status |
|------|--------|
| `tests/test_emission.py` | ✅ **NEW** — 16 Python math-validation tests (cross-language spec check) |
| `src/token/emission.service.spec.ts` | ✅ **NEW** — 19 TypeScript Jest tests |

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
| HTTP endpoint for canonical emission | Missing (prev) | ✅ **Added** `POST /api/v1/token/emit` |

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### HTTP Endpoints (token.controller.ts)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/v1/token/emit` | **Canonical** | `mintForTransaction()` — 1:1 emission + fee split + burn |
| `POST /api/v1/token/mint` | Legacy | Raw fiat-deposit mint (no commission, no burn) |
| `POST /api/v1/token/burn` | Existing | Burn tokens + trigger fiat payout via bridge |

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Example: $10,000 Transaction

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

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, verified by 9 test cases)
2. `nodeShare + afcShare == commission` (exact split, verified by test)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (verified in Python tests)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction, verified by rollback test)

---

## 6. Changes Made in This Audit Pass

| File | Change |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — 19 TypeScript Jest unit tests for `EmissionService` |
| `src/token/token.controller.ts` | **Updated** — added canonical `POST /api/v1/token/emit` endpoint |
| `tests/test_emission.py` | **Created** — 16 Python math-validation tests (all passing) |
| `AGENT_CORE_REPORT.md` | **Updated** — this document |

---

## 7. Test Results

```
TypeScript (Jest):
  PASS src/token/emission.service.spec.ts
  Tests: 19 passed, 19 total

Python (unittest):
  Ran 16 tests in 0.001s — OK
```

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Epoch AFC sync** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`. Consider syncing the in-memory index after each epoch finalization.
- **Deprecate or gate legacy `POST /mint`** — the legacy endpoint bypasses the canonical emission model. Consider requiring governance approval or adding a feature flag to disable it in production.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in the bridge/ingestion path with the canonical `POST /api/v1/token/emit` entry point.
