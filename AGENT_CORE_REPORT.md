# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-W4a10`
**Date:** 2026-05-16
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or fix all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only, NOT deprecated

| File | Pre-patch content | Current state |
|------|-----------------|---------------|
| `coin_emission_model.md` | Previously described `E = F / N` (fee ÷ nodes) | ✅ Rewritten to canonical 1:1 formulas + AFC index (PR #72) |
| `aro_emission_protocol.md` | Previously `EMISSION_AMOUNT = Σ(load × index × ratio)` | ✅ Rewritten — canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | Previously 60/15/15/5/5 multi-actor split | ✅ Rewritten to canonical 75/25; historical note preserved |
| `burn_and_mint_rules.md` | General burn-on-withdrawal policy | ✅ Non-contradictory, unchanged |
| `README.md` | Architecture overview | ✅ No formula conflicts, unchanged |

Module 01 contains **only documentation**. The canonical source-of-truth lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Finding |
|------|---------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields match canonical model |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — `calculate()` + `processTransactionEmission()` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` proxies to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a no-op (deprecated) |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `emission.service.spec.ts` | ⚠️ **Missing** — added in this pass (see §3) |

---

## 2. Canonical Model Verification

| Rule | Canonical specification | Code state |
|------|------------------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` — `EmissionService.calculate()` line 58 |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` — line 59 |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` — line 60 |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` — line 61 |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` — `processTransactionEmission()` step 4 |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` — `updateAfcReserve()` |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction — commit / rollback covers all four ledger ops |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` applies same split |

**Conclusion: no code rewrite required.** All rules are implemented correctly.

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
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
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
  → every subsequent emission is priced at this index
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `AGENT_CORE_REPORT.md` | Updated with 2026-05-16 audit findings (this document) |
| `src/token/emission.service.spec.ts` | **Added** — unit tests for canonical model rules (see recommendation from previous pass) |

All documentation in `01_coin_engine/` confirmed correct; no doc changes required.

---

## 7. Recommendations (Open Items)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots for continuity across deployments.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Epoch AFC sync** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()` post-epoch; consider syncing the in-memory index after each epoch finalization.
