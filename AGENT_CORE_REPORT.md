# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-NxiGC`  
**Date:** 2026-05-20  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

The module contains spec files and `.md` documentation. No source code lives here. The canonical source of truth is `src/token/emission.service.ts`.

| File | Canonical alignment |
|------|---------------------|
| `coin_emission_model.md` | ✅ Documents 1:1 emission, 0.5% commission, 75/25 split, AFC reserve index |
| `aro_emission_protocol.md` | ✅ Documents canonical lifecycle: MINT → FEE_DISTRIBUTION × 2 → BURN |
| `payment_distribution.md` | ✅ Documents canonical 75/25 split; notes deprecated 60/15/15/5/5 table |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy; no contradictions |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Finding:** Module 01 is pure documentation. It is not deprecated. All docs correctly reflect the canonical model.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution. No emission logic exists here. The actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code verified ✅

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct shape |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic QueryRunner; correct formulas |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is explicit no-op; `getCurrentPrice()` returns ProcessReserve index |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Canonical code verified ✅

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split applied: 75% → node pool by PoT weight, 25% → AFC reserve |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | PoT weight scoring and normalization — correct; no emission logic |
| `process_reserve.service.ts` | Legacy process-volume ledger; `log1p`-based index — used by `TokenomicsService.getCurrentPrice()` (not by `EmissionService`) |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | Default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split — nodes | 75% | ✅ `nodeShare = commission * 0.75` |
| Fee split — AFC reserve | 25% | ✅ `afcShare = commission * 0.25` |
| ARO burned after TX | Yes (transient supply) | ✅ `BURN` ledger entry for `emissionAmount` in same atomic DB transaction |
| AFC reserve grows → price rises | `1.0 + sqrt(reserve) / 10_000` | ✅ Exact formula in `updateAfcReserve()` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot.circulatingSupply` unchanged per TX cycle |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` uses same ratios |
| All steps atomic | Yes | ✅ Single `QueryRunner` wraps all 4 ledger operations |

**Result: Code fully matches the canonical model. No rewrites required.**

---

## 3. Canonical Emission Lifecycle

### EmissionService — `src/token/emission.service.ts`

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × 0.005  // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ [atomic QueryRunner transaction]
  │    MINT:             emissionAmount → recipient
  │    FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  │    FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
  │    updateAfcReserve(afcShare):
  │      reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  │    BURN:             emissionAmount → SYSTEM_BURN_VAULT
  │    updateSupplySnapshot()
  └─ commitTransaction()
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per active validator)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.000035
  → every subsequent emission is priced higher
```

---

## 5. Invariants (all enforced)

1. `emissionAmount == transactionAmount` — hard-coded equality in `calculate()`, throws on `amount ≤ 0`
2. `nodeShare + afcShare == commission` — exact arithmetic split, no rounding loss
3. `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` — net-zero circulating supply
4. `reserveIndex` monotonically non-decreasing — only additions to `totalReserve`
5. All four ledger steps succeed or all roll back — `QueryRunner` atomicity

---

## 6. Open Recommendations (non-blocking)

| Issue | Recommendation |
|-------|----------------|
| `AfcReserveState` in-memory only | Persist to a dedicated DB entity to survive restarts |
| `FeeDistributionService` does not call `EmissionService.updateAfcReserve()` | After epoch finalization, sync in-memory AFC index to include epoch-level contributions |
| Legacy `TokenService.mint()` still exists | Document clearly that callers should use `mintForTransaction()` for canonical flow; remove `mint()` in a future breaking-change release |
| No unit tests for `EmissionService.calculate()` | Add property-based tests: dust amounts, max commission rate guard, zero-amount rejection |
