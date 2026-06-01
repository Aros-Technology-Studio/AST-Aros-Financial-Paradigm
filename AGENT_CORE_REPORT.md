# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-QPr22`  
**Date:** 2026-06-01  
**Task:** Audit ArosCoin emission logic against canonical model; fix all divergences

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

Module 01 contains markdown specification files only. No source code lives here.
The canonical source of truth for emission logic is `src/token/emission.service.ts`.

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Reflects canonical 1:1 model with AFC reserve index formula |
| `aro_emission_protocol.md` | ✅ Documents canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | ✅ 75% nodes / 25% AFC reserve split |
| `burn_and_mint_rules.md` | ✅ Consistent with canonical burn-on-completion policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code: VERIFIED + EXTENDED

| File | Status | Action |
|------|--------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correct | None |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle | `updateAfcReserve` made public as `accumulateAfcReserve` |
| `token.service.ts` | ✅ `mintForTransaction()` → `EmissionService` | None |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` → `processReserve.reserveIndex` (legacy compat) | None |
| `token.module.ts` | ✅ `EmissionService` registered + exported | None |
| `token.controller.ts` | ⚠ No canonical emission endpoint | **Added** `POST /emit`, `GET /emission/price`, `GET /emission/reserve` |

### src/fee_distribution/ — Fixed: AFC reserve sync gap

| File | Previous state | Action |
|------|---------------|--------|
| `fee_distribution.service.ts` | ✅ 75/25 split; recorded AFC to ledger but did NOT call `EmissionService.accumulateAfcReserve()` → price index not updated after epoch finalization | **Fixed**: now calls `emissionService.accumulateAfcReserve(afcReserve)` after each epoch AFC ledger record |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy volume ledger; `reserveIndex` via `log1p` — used only by `TokenomicsService.getCurrentPrice()` (legacy compat path) |
| `pot.service.ts` | PoT scoring + weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (rate=0.005) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees: same 75/25 split | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC → price index | **WAS MISSING** | ✅ **Fixed**: `emissionService.accumulateAfcReserve(afcReserve)` called post-epoch |

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
  ├─ accumulateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch-level sync (`src/fee_distribution/fee_distribution.service.ts`)

After each epoch finalization:
```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.accumulateAfcReserve(afcReserve)  ← NEW: syncs price index
  │
  └─ For each node:
       reward = nodePool × weight_i
       Ledger VALIDATOR_REWARD: reward → nodeId
```

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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. Epoch-level AFC contributions also update `reserveIndex` (fixed in this pass)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | `updateAfcReserve` renamed to public `accumulateAfcReserve` — enables epoch-level sync |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; added `emissionService.accumulateAfcReserve(afcReserve)` call after epoch AFC ledger record |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` (canonical endpoint), `GET /emission/price`, `GET /emission/reserve` |
| `AGENT_CORE_REPORT.md` | Full audit refresh (this document) |

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots keyed by epoch.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and multi-epoch reserve accumulation.
- **Wire `mintForTransaction()` into ingestion pipeline** — `src/integration/ingestion/ingestion.service.ts` has a commented-out `tokenService.mint()` call; replace with `tokenService.mintForTransaction()`.
- **`token.controller.ts` `POST /mint`** — legacy endpoint still exists; consider deprecating it in favour of `POST /emit` once all callers are migrated.
