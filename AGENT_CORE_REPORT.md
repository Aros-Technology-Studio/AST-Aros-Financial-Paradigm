# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-odXWQ`  
**Date:** 2026-06-02  
**Task:** Full audit and alignment of ArosCoin emission logic against the canonical model

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical — 1:1 formula, 75/25 split, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical — sequenceDiagram matches `EmissionService` flow exactly |
| `payment_distribution.md` | ✅ Canonical — 75/25 split, historical note re: superseded 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Correct — general burn-on-completion policy; no conflicts |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

All nine `.md` files describe PoT validation, slashing, incentive distribution, and signature model.  
No emission logic resides here. Actual PoT code is in `src/proof_of_transaction_engine/`.

### src/token/ — Canonical code

| File | Status | Notes |
|------|--------|-------|
| `emission.interfaces.ts` | ✅ Correct | `EmissionResult`, `EmissionConfig`, `AfcReserveState` properly typed |
| `emission.service.ts` | ✅ Correct | Full canonical 1:1 lifecycle (see §3) |
| `token.service.ts` | ✅ Correct | `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ Correct | `getCurrentPrice()` reads `processReserve` index; `updateInternalValuation()` is no-op |
| `token.module.ts` | ✅ Correct | `EmissionService` registered and exported |
| `token.controller.ts` | ✅ Fixed | Added `POST /api/v1/token/emit` canonical endpoint; `/mint` marked `@deprecated` |

### src/fee_distribution/ — Status: Canonical

| File | Status |
|------|--------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split per epoch |

### src/bridge/ — Status: FIXED in this pass

| File | Pre-fix state | Fix applied |
|------|--------------|-------------|
| `bridge.service.ts` → `handleFiatDepositWebhook()` | ❌ Called legacy `tokenService.mint()` — no commission, no 75/25 split, no AFC reserve update | **Rewired to `mintForTransaction()`** |

### src/integration/ingestion/ — Status: FIXED in this pass

| File | Pre-fix state | Fix applied |
|------|--------------|-------------|
| `ingestion.service.ts` | ❌ Canonical mint was commented out; service had no `TokenService` dependency | **Injected `TokenService`, wired `mintForTransaction()`** |
| `ingestion.module.ts` | ❌ No `TokenModule` import | **Added `TokenModule` import** |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Bridge deposit uses canonical path | Yes | ✅ **Fixed**: `handleFiatDepositWebhook()` now calls `mintForTransaction()` |
| Ingestion uses canonical path | Yes | ✅ **Fixed**: `ingestAsset()` now calls `mintForTransaction()` |
| Canonical HTTP endpoint exposed | Yes | ✅ **Fixed**: `POST /api/v1/token/emit` added |

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
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
       └─ updateSupplySnapshot() — totalMinted++, totalBurned++, circulatingSupply unchanged
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

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch finalization)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (sqrt is monotone; afcAmount ≥ 0)
5. All ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. Bridge and ingestion paths MUST go through `mintForTransaction()` — never legacy `mint()`

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/bridge/bridge.service.ts` | `handleFiatDepositWebhook()` now calls `tokenService.mintForTransaction()` instead of legacy `mint()` |
| `src/integration/ingestion/ingestion.service.ts` | Injected `TokenService`; `ingestAsset()` calls `mintForTransaction()` with computed ARO amount |
| `src/integration/ingestion/ingestion.module.ts` | Added `TokenModule` to imports so `TokenService` is resolvable |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` canonical endpoint; deprecated `/mint` endpoint |
| `AGENT_CORE_REPORT.md` | Updated with 2026-06-02 findings and diff table |

Documentation in `01_coin_engine/` was aligned in the previous pass (PR #72 / `claude/inspiring-cannon-4qbjK`) and requires no further changes.

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory in `EmissionService`; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots and a load-on-startup call.
- **Sync `FeeDistributionService` epoch AFC contributions to `EmissionService`** — `distributeRewards()` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`. The in-memory `reserveIndex` diverges from the epoch-level AFC accumulation. Consider a shared persistence layer or a sync call after each epoch finalization.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, maximum commission rate, zero-amount guard, and the `nodeShare + afcShare == commission` invariant.
- **`ProcessReserveLedgerService` formula alignment** — uses `log1p` formula; `EmissionService` uses `sqrt`. These are parallel systems for different purposes (`processReserve` drives legacy `tokenomics.getCurrentPrice()`, canonical price comes from `EmissionService.getCurrentEmissionPrice()`). Evaluate whether to unify or deprecate `processReserve`.
