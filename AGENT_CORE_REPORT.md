# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-Md2Ny`  
**Date:** 2026-05-18  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | Verified State |
|------|---------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, 75/25 split, AFC reserve index |
| `aro_emission_protocol.md` | ✅ Full lifecycle with Mermaid sequence diagram, canonical formulas |
| `payment_distribution.md` | ✅ 75/25 split clearly documented; historical 60/15/15/5/5 noted and superseded |
| `burn_and_mint_rules.md` | ✅ Burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. All source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive
distribution. Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission
logic resides here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified State |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split 75/25 → AFC update → burn (atomic) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat flows |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; canonical price lives in `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified State |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy process-volume ledger (log1p index); used by legacy tokenomics path only |
| `pot.service.ts` | PoT node scoring (`α·txCount + β·fees − δ·penalties`) and weight normalization — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code State |
|------|---------------|-----------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction wraps all four ledger ops |

**All rules pass. No rewrite required.**

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
Emission       = 10,000 ARO  (minted to recipient, 1:1)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on `amount ≤ 0`)
2. `nodeShare + afcShare == commission` (exact float split; no rounding loss discarded)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+= afcAmount`, never decrements)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Open Recommendations

These items do not block canonical correctness but should be addressed in subsequent passes:

| Priority | Item |
|----------|------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots to survive restarts. |
| Medium | **Sync epoch AFC into `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC to ledger but does not call `EmissionService.updateAfcReserve()`. The in-memory `reserveIndex` drifts if epochs run without per-TX emission. |
| Medium | **Unit tests for `EmissionService.calculate()`** — cover: dust amounts (< 0.00000001), max commission rate edge, `commissionRate=0` guard, `transactionAmount=0` guard. |
| Low | **Route bridge `mint()` to canonical path** — legacy `TokenService.mint()` (used for fiat deposit) bypasses `EmissionService`. If fiat deposits should carry canonical commission, wire them through `mintForTransaction()`. |
