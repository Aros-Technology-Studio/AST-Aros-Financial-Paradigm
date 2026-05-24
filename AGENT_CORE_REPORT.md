# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-awnMQ`  
**Date:** 2026-05-24  
**Task:** Audit ArosCoin emission logic against the canonical model; verify, correct, and document findings

---

## 1. Executive Summary

The canonical 1:1 emission model is **fully and correctly implemented** in `src/token/emission.service.ts`.  
Module 01 (`01_coin_engine/`) is marked deprecated in the main README and contains **documentation only** — its conceptual specs previously diverged from the canonical model but were aligned in a prior pass (PR #72).  
Module 10 (`10_proof_of_transaction_engine/`) contains PoT validation docs and code — no direct emission logic, but feeds into fee distribution after consensus.  
Unit tests for `EmissionService` were absent; they have been added in this pass (`src/token/emission.spec.ts`).

---

## 2. Directory Audit

### 01_coin_engine/ — Status: Documentation Only (Deprecated Concept Layer)

The main `README.md` explicitly states:

> `| **01** | **Coin Engine** | *(Deprecated)* Conceptual economic specifications. |`

This module contains `.md` and `.json` spec files — **no TypeScript source code**.  
All `.md` files were audited against the canonical model:

| File | Status | Notes |
|------|--------|-------|
| `aro_emission_protocol.md` | ✅ Aligned | Canonical 1:1 formula, 75/25 split documented |
| `coin_emission_model.md` | ✅ Aligned | Emission = TX Amount, AFC reserve index formula present |
| `payment_distribution.md` | ✅ Aligned | 75% nodes / 25% AFC reserve (old 60/15/15/5/5 was replaced in PR #72) |
| `burn_and_mint_rules.md` | ✅ Aligned | Burn-after-TX lifecycle described correctly |
| `AROS_Coin_TokenSpec.json` | ✅ Consistent | Token spec reflects dynamic supply, no hard cap |
| `burn_mechanism.md` | ✅ Consistent | Auto-burn on TX completion |
| `node_participation_payments.md` | ✅ Consistent | Node rewards from 75% pool |
| `coin_volatility_controls.md` | ✅ Consistent | AFC reserve index as price driver |

**Conclusion:** Module 01 documentation is now consistent with canonical model. No source code changes needed here.

---

### 10_proof_of_transaction_engine/ — Status: Documentation Only, Correct

Contains `.md` spec files for PoT consensus layer. Actual implementation is in `src/proof_of_transaction_engine/`.

Key specs verified:

| File | Relationship to Emission |
|------|--------------------------|
| `pot_tx_incentive_distribution.md` | Defines 60% validators / 30% attesters / 10% burn within the node pool — consistent with 75% total to nodes |
| `pot_tx_weighting_model.md` | `Weight = (Activity × 0.5) + (Integrity × 0.3) + (Context × 0.2)` — determines node share within the 75% pool |
| `pot_tx_validation_logic.md` | Validation triggers emission entry point; no emission math here |
| All others | No emission logic; PoT-internal mechanics only |

**Conclusion:** No changes needed. PoT incentive split is a subdivision *within* the 75% node allocation — not contradictory to 75/25 canonical split.

---

### src/token/ — Status: Canonical Implementation Confirmed ✅

| File | Status |
|------|--------|
| `emission.service.ts` | ✅ CANONICAL — 1:1 lifecycle fully implemented |
| `emission.interfaces.ts` | ✅ Correct interface definitions |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()`/`burn()` for fiat I/O preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; price read from `processReserve.getReserveState()` |
| `token.module.ts` | ✅ `EmissionService` registered and exported |
| `token.entity.ts` | ✅ Token entity model |
| `distribution_event.entity.ts` | ✅ Fee distribution event log |
| `entities/supply_snapshot.entity.ts` | ✅ Supply audit trail |
| `token.controller.ts` | ✅ REST API surface |
| **`emission.spec.ts`** | ✅ **NEW — Added in this pass** |

---

## 3. Canonical Model Verification Table

| Rule | Canonical Spec | Implementation | File:Line | Status |
|------|---------------|----------------|-----------|--------|
| Emission = TX Amount | `E = A` (1:1) | `emission = transactionAmount` | `emission.service.ts:58` | ✅ |
| Fee = TX Amount × rate | `C = A × 0.005` | `commission = transactionAmount * rate` | `emission.service.ts:59` | ✅ |
| Node share = 75% of fee | `75%` | `nodeShare = commission * 0.75` | `emission.service.ts:60` | ✅ |
| AFC share = 25% of fee | `25%` | `afcShare = commission * 0.25` | `emission.service.ts:61` | ✅ |
| Mint ARO 1:1 to recipient | Ledger MINT | `recordTransaction(MINT, emissionAmount)` | `emission.service.ts:102–110` | ✅ |
| Record 75% to node pool | Ledger FEE_DISTRIBUTION | `recordTransaction(FEE_DISTRIBUTION, nodeShare → NODE_POOL)` | `emission.service.ts:112–121` | ✅ |
| Record 25% to AFC reserve | Ledger FEE_DISTRIBUTION | `recordTransaction(FEE_DISTRIBUTION, afcShare → AFC_RESERVE)` | `emission.service.ts:123–132` | ✅ |
| Burn ARO after TX | Auto-burn | `recordTransaction(BURN, emissionAmount → BURN_VAULT)` | `emission.service.ts:138–146` | ✅ |
| AFC reserve → price index rises | `index = 1.0 + sqrt(R)/10000` | `reserveIndex = 1.0 + Math.sqrt(totalReserve) / 10_000` | `emission.service.ts:175–176` | ✅ |
| Net circulating supply = 0 | Mint + Burn cancel | `circulatingSupply = prevSupply` (unchanged) | `emission.service.ts:226` | ✅ |
| Atomic execution | All-or-nothing | `QueryRunner` transaction with rollback | `emission.service.ts:96–162` | ✅ |

**All 11 canonical rules are satisfied.**

---

## 4. Canonical Lifecycle Diagram

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount              // 1:1
  │    commission     = txAmount × 0.005      // 0.5% default
  │    nodeShare      = commission × 0.75     // 75% → nodes
  │    afcShare       = commission × 0.25     // 25% → AFC reserve
  │
  ├─ BEGIN ATOMIC TRANSACTION
  │
  ├─ [Step 1] Ledger MINT:              emissionAmount  → recipient
  ├─ [Step 2a] Ledger FEE_DISTRIBUTION: nodeShare       → SYSTEM_NODE_POOL
  ├─ [Step 2b] Ledger FEE_DISTRIBUTION: afcShare        → SYSTEM_AFC_RESERVE
  ├─ [Step 3]  updateAfcReserve(afcShare):
  │              totalReserve += afcShare
  │              reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  ├─ [Step 4]  Ledger BURN:             emissionAmount  → SYSTEM_BURN_VAULT
  ├─ [Step 5]  SupplySnapshot: totalMinted+= E, totalBurned += E, circulating unchanged
  │
  └─ COMMIT (or ROLLBACK on any error)
```

---

## 5. Worked Example: $10,000 Transaction

```
Input:
  TX Amount          = 10,000

Emission calculation:
  emissionAmount     = 10,000 ARO   (1:1 mint to recipient)
  commission         = 10,000 × 0.005 = 50 ARO
  nodeShare          = 50 × 0.75    = 37.50 ARO  (distributed by PoT weight)
  afcReserveShare    = 50 × 0.25    = 12.50 ARO  (locked in AFC reserve)
  burn               = 10,000 ARO   (destroyed post-TX)

Net circulating change = 10,000 (minted) − 10,000 (burned) = 0

AFC reserve after this TX:
  totalReserve       = 12.50 (cumulative)
  reserveIndex       = 1.0 + sqrt(12.50) / 10,000
                     = 1.0 + 3.5355... / 10,000
                     = 1.00003536

  → Every subsequent emission is priced higher by this index
```

---

## 6. System Addresses

| Constant | Address String |
|----------|---------------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 7. Where Emission Logic Lives (Module Migration Map)

```
01_coin_engine/        → DEPRECATED (docs only, conceptual specs)
                              ↓
                       PR #72 aligned docs to canonical model
                              ↓
src/token/emission.service.ts → CANONICAL SOURCE OF TRUTH
src/token/token.service.ts    → Public entry point (mintForTransaction)
src/token/tokenomics.service.ts → Deprecated valuation logic (no-op)
src/proof_of_transaction_engine/process_reserve.service.ts → Reserve ledger
src/fee_distribution/fee_distribution.service.ts           → Epoch fee split
```

---

## 8. Issues Found and Actions Taken

### ✅ Code Already Correct — No Rewrites Needed

The emission implementation in `src/token/emission.service.ts` was already fully canonical.  
The previous AGENT-CORE pass (PR #72, commit `f6239f9`) already corrected all divergences.

### ✅ Unit Tests Added — `src/token/emission.spec.ts`

The spec file was absent. A comprehensive test suite has been added covering:
- Pure calculation correctness (1:1 ratio, 75/25 split, commission math)
- Edge cases (dust amounts, max commission rate, zero/negative guard)
- AFC reserve index monotonic growth
- `processTransactionEmission` integration (mocked ledger/dataSource)
- Governance commission rate update

### ⚠️ Known Risk: In-Memory AFC Reserve State

`AfcReserveState` is stored in-memory in `EmissionService`. It resets on service restart.

**Impact:** `reserveIndex` reverts to `1.0` after restart → emission pricing discontinuity.  
**Recommendation:** Persist `AfcReserveState` to a dedicated `afc_reserve_snapshots` table and reload on `onModuleInit()`.  
**Priority:** Medium — no correctness bug, but a production reliability concern.

### ⚠️ Legacy `mint()` / `burn()` Still Active in `token.service.ts`

These methods handle fiat deposit/withdrawal (not transaction processing) and correctly modify `circulatingSupply`. They do **not** conflict with the canonical emission model — they serve a different code path. However, callers should be audited to ensure no transaction-processing path accidentally calls `mint()` instead of `mintForTransaction()`.

---

## 5. Invariants Guaranteed by Implementation

1. **`emissionAmount == transactionAmount`** — enforced in `calculate()`, throws `BadRequestException` on non-positive input
2. **`nodeShare + afcReserveShare == commission`** — exact 75/25 ratio split
3. **`totalMinted == totalBurned`** per canonical TX cycle in `SupplySnapshot`
4. **`reserveIndex` monotonically non-decreasing** — only increases, never decreases
5. **Atomic execution** — all four ledger steps succeed or all roll back via `QueryRunner`

---

## 6. Recommendations (Priority Order)

| # | Recommendation | Priority |
|---|---------------|----------|
| 1 | Persist `AfcReserveState` to DB (`afc_reserve_snapshots` table); reload on startup | High |
| 2 | Wire `mintForTransaction()` into all ingestion/bridge code paths; deprecate direct `mint()` calls for TX processing | Medium |
| 3 | Sync `EmissionService.updateAfcReserve()` after each `FeeDistributionService` epoch finalization | Medium |
| 4 | Add integration tests for full TX lifecycle (ingestion → PoT → emission → fee distribution) | Medium |
| 5 | Expose AFC reserve state via REST endpoint for monitoring dashboards | Low |
