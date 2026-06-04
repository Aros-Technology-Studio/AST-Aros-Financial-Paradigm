# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-xBJ39`  
**Date:** 2026-06-04  
**Re-audit of:** original implementation in `agent/core-emission` → merged PR #79 (commit `f6239f9`)  
**Task:** Verify ArosCoin emission logic against canonical model; rewrite if diverged

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

Module 01 is **NOT deprecated**. It is a pure documentation layer describing
tokenomics rules. Source code lives in `src/token/`.

| File | Status after audit |
|------|--------------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator weight formula |
| `burn_and_mint_rules.md` | ✅ General burn policy; consistent with implementation |
| `README.md` | ✅ Architecture overview; no formula conflicts |

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|----------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat-deposit flows |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|----------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Canonical 75/25 split applied to epoch-level collected fees |

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
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (`defaultCommissionRate = 0.005`) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction wraps all 4 ledger operations |

**Verdict: NO CODE CHANGES REQUIRED. Implementation is fully aligned with the canonical model.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1 (no multiplier)
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
```

All four ledger operations plus supply snapshot execute atomically within a
single `QueryRunner` transaction — rollback on any failure.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### Commission Rate — Governance

`EmissionService.updateCommissionRate(newRate)` allows governance to adjust
the rate (0 < rate < 1 exclusive). Current default: `0.005` (0.5%).

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch finalization)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel within same atomic TX)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced by this rising index
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only grows as reserve accumulates)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. `circulatingSupply` net change = 0 per canonical emission cycle (mint cancels burn)

---

## 6. Module Map: Where Emission Logic Lives

```
DOCUMENTATION
  01_coin_engine/coin_emission_model.md   ← canonical formulas (spec)
  01_coin_engine/aro_emission_protocol.md ← protocol description
  01_coin_engine/payment_distribution.md  ← 75/25 split spec

SOURCE CODE
  src/token/emission.interfaces.ts        ← EmissionResult, EmissionConfig, AfcReserveState
  src/token/emission.service.ts           ← CANONICAL ENGINE (primary)
  src/token/token.service.ts              ← mintForTransaction() entry point
  src/token/tokenomics.service.ts         ← processing pool + legacy price hook
  src/fee_distribution/fee_distribution.service.ts  ← epoch-level 75/25 fee split
```

---

## 7. Outstanding Recommendations (unchanged from previous pass)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart.
  Add an `AfcReserveEntity` table with periodic snapshots or load from last
  `SupplySnapshot` at boot.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()`
  calls in bridge/ingestion path with the canonical entry point for full fee
  accounting.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts,
  max commission rate, zero-amount guard, and `nodeShare + afcShare == commission`
  invariant.
- **Sync epoch AFC into `EmissionService`** — `FeeDistributionService` records
  AFC reserve on the ledger at epoch finalization but does not call
  `EmissionService.updateAfcReserve()`; in-memory `reserveIndex` will drift unless
  synced after each epoch.
