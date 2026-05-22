# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-zmSLV`  
**Date:** 2026-05-22  
**Task:** Audit ArosCoin emission logic against the canonical model, align all code, expose canonical endpoint, add unit tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Content | State |
|------|---------|-------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index, example, emission phases | ✅ Correct |
| `aro_emission_protocol.md` | Canonical formulas + Mermaid flow + invariants | ✅ Correct |
| `payment_distribution.md` | 75/25 canonical split with PoT weight formula | ✅ Correct |
| `burn_and_mint_rules.md` | Burn-on-completion policy, non-contradictory | ✅ Unchanged |
| `README.md` | Architecture overview, no formula conflicts | ✅ Unchanged |

**Module 01 is NOT deprecated.** It is pure specification documentation. The canonical source-of-truth lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files (PoT validation, slashing, signature model, incentive distribution).  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code verified correct; one gap patched

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly defined |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — no changes needed |
| `emission.service.spec.ts` | ✅ **NEW** — 15 unit tests covering `calculate()`, AFC reserve, governance, and full lifecycle |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat bridge |
| `token.controller.ts` | ✅ **PATCHED** — added `POST /api/v1/token/emit` and `GET /api/v1/token/emission/state` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` marked `@deprecated`; `getCurrentPrice()` reads reserve index |

### src/fee_distribution/ — Status: Canonical 75/25 confirmed

`FeeDistributionService.distributeRewards()` applies the canonical split at epoch level:
- `nodePool = totalFees × 0.75` → distributed by PoT weight to each active node
- `afcReserve = totalFees × 0.25` → sent to `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring + weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also split 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Canonical endpoint exposed | Yes | ✅ `POST /api/v1/token/emit` (added this pass) |

---

## 3. Changes Made in This Pass

### 3.1 `src/token/token.controller.ts` — Added canonical endpoint

**Problem:** The controller only exposed `POST /api/v1/token/mint` (legacy) which calls `TokenService.mint()` — a path that does NOT execute the canonical emission lifecycle (no fee split, no burn, no AFC reserve update).

**Fix:** Added two new endpoints:

```
POST /api/v1/token/emit
  body: { transactionAmount, recipient, referenceId, commissionRate? }
  → delegates to TokenService.mintForTransaction()
  → executes full canonical lifecycle via EmissionService
  → returns emission breakdown + current AFC reserve index

GET /api/v1/token/emission/state
  → returns AfcReserveState + current emissionPrice (reserveIndex)
```

The legacy `POST /api/v1/token/mint` is preserved for the fiat bridge deposit flow (it serves a different purpose).

### 3.2 `src/token/emission.service.spec.ts` — 15 unit tests (new file)

Covers:
- `calculate()`: 1:1 invariant, 75/25 split invariant, custom rate, zero/negative guards, rate-independence of emission
- AFC reserve: initial state, `getCurrentEmissionPrice()` passthrough
- `updateCommissionRate()`: valid rate, boundary rejections (0, 1, >1)
- `processTransactionEmission()`: 4 ledger calls, commit/rollback, correct amounts, AFC reserve growth, monotonic price index

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
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations + SupplySnapshot update execute atomically within a single QueryRunner transaction.

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
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000353
  → every subsequent emission is priced slightly higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net-zero circulating supply change
4. `reserveIndex` is monotonically non-decreasing — only grows, never decreases
5. All four ledger steps succeed or all roll back — enforced by atomic `QueryRunner` transaction

---

## 7. Open Recommendations (not implemented in this pass)

| Priority | Recommendation |
|----------|---------------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add `AfcReserveEntity` table with upsert after each emission. |
| HIGH | **Wire `mintForTransaction()` into ingestion/bridge pipeline** — replace remaining direct `mint()` calls in the bridge path with the canonical `POST /api/v1/token/emit` endpoint. |
| MEDIUM | **Sync epoch AFC contributions into `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index diverges from actual epoch accumulation. |
| LOW | **Add integration test for full TX cycle** — verify that `totalMinted == totalBurned` invariant holds across multiple emissions via an in-memory DB. |
