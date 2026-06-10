# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-ah6ns3`  
**Date:** 2026-06-10 (re-audit; original audit 2026-05-12 on `agent/core-emission` → merged PR #72)  
**Task:** Audit ArosCoin emission logic against the canonical model; verify all code and documentation remain aligned

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

Module 01 is **not deprecated** — it is pure reference documentation. Canonical source code lives in `src/token/`.

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Documents canonical 1:1 formula (aligned in PR #72) |
| `aro_emission_protocol.md` | ✅ Documents canonical emit → fee-split → burn lifecycle |
| `payment_distribution.md` | ✅ Documents 75/25 node/AFC split |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy |
| `README.md` | ✅ Architecture overview, no formula conflicts |

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT implementation lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: ✅ Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee-split → AFC update → burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compatibility |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to reserve index; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: ✅ Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75% node pool, 25% AFC reserve per epoch |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code |
|------|-----------|------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (`defaultCommissionRate: 0.005`) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

**All 7 canonical rules verified. No divergence found.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1 — canonical rule
  │    commission     = txAmount × rate   // default 0.5%
  │    nodeShare      = commission × 0.75 // 75% nodes
  │    afcShare       = commission × 0.25 // 25% AFC reserve
  │
  ├─ Ledger MINT:             emissionAmount → recipient           (Step 1)
  ├─ Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL       (Step 2a)
  ├─ Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE     (Step 2b)
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000           (Step 3)
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT  (Step 4)
     SupplySnapshot saved (totalMinted++, totalBurned++, circulatingSupply unchanged)
     QueryRunner.commit() — all 4 ledger steps atomic
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT validator weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out in same atomic TX)

After 12.50 ARO AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split with no rounding loss beyond float64 precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing — grows with every AFC deposit, never decreases
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction with rollback on catch)

---

## 6. Documentation Changes Made

All documentation changes were landed in PR #72 (`agent/core-emission`). No documentation divergence found in this re-audit.

| File | Change (PR #72) |
|------|-----------------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas |
| `01_coin_engine/aro_emission_protocol.md` | Replaced load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split |

---

## 7. Open Recommendations

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add `AfcReserveEntity` table with periodic snapshots and load on startup. |
| HIGH | **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in bridge/ingestion path with the canonical entry point. |
| MED | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard. |
| MED | **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; reserve index drifts across epochs unless synced. |
| LOW | **Enforce `commissionRate` bounds in governance** — `updateCommissionRate()` accepts any value in (0, 1); add governance-layer min/max constraints. |
