# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-18  
**Task:** Audit ArosCoin emission logic against the canonical model; fix any divergence

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Documents canonical 1:1 emission, AFC reserve index, 75/25 split |
| `aro_emission_protocol.md` | ✅ Canonical protocol spec with mermaid lifecycle diagram |
| `payment_distribution.md` | ✅ Documents 75% nodes / 25% AFC reserve split |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. All canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Primary canonical code

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` interfaces correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve` made **public** (this patch) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` kept for fiat bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; pricing delegates to `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Fixed in this patch

| File | State before | State after |
|------|-------------|-------------|
| `fee_distribution.service.ts` | ⚠️ Recorded AFC on ledger but did NOT update `EmissionService.afcReserveState` | ✅ Now calls `emissionService.updateAfcReserve(afcReserve)` after each epoch |

### src/proof_of_transaction_engine/ — Unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy volume ledger; `log1p`-based index used only by legacy `TokenomicsService.getCurrentPrice()` |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burned after TX completes | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic transaction |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` (sub-linear) |
| Epoch fees also 75/25 | Yes | ✅ `distributeRewards()` applies `NODE_SHARE_RATIO=0.75` / `AFC_SHARE_RATIO=0.25` |
| Epoch AFC synced to price index | **Previously missing** | ✅ **Fixed** — `emissionService.updateAfcReserve(afcReserve)` now called at epoch close |

---

## 3. Bug Fixed: Epoch AFC Not Synced to Emission Price Index

### Root cause

`FeeDistributionService.distributeRewards()` correctly recorded the epoch's 25% AFC share to
`SYSTEM_AFC_RESERVE_000000000000000000` on the ledger, but never called
`EmissionService.updateAfcReserve()`. This meant the in-memory `reserveIndex` — which drives the
emission price — only accumulated per-TX contributions from `processTransactionEmission()`.
Epoch-level accumulations were silently dropped.

### Fix (2 files)

**`src/token/emission.service.ts`**  
Changed `private updateAfcReserve()` → `public updateAfcReserve()` so
`FeeDistributionService` can call it directly.

**`src/fee_distribution/fee_distribution.service.ts`**  
- Added `import { EmissionService }` from `../token/emission.service`  
- Injected `private readonly emissionService: EmissionService` into constructor  
- After recording the AFC ledger entry, added:
  ```ts
  this.emissionService.updateAfcReserve(afcReserve);
  ```

`TokenModule` already exported `EmissionService` and `FeeDistributionModule` already imported
`TokenModule`, so no module-level changes were needed.

---

## 4. Implementation Reference

### EmissionService — canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount           // 1:1
  │    commission     = txAmount × rate    // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:              emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION:  nodeShare  → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION:  afcShare   → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:              emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger steps execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — epoch close (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.updateAfcReserve(afcReserve)   ← NEW (this patch)
  │
  └─ For each node (by PoT weight):
       Ledger VALIDATOR_REWARD: nodePool × weight → nodeId
```

### System addresses

| Constant | Value |
|----------|-------|
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
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked; price index rises)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

reserveIndex after 12.50 AFC:
  = 1.0 + sqrt(12.50) / 10_000
  = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants (verified)

1. `emissionAmount == transactionAmount` (1:1, enforced in `calculate()`)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing — rises on every TX and every epoch
5. All ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Remaining Recommendations (not blocking)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with snapshots per epoch.
- **Wire `mintForTransaction()` throughout** — replace legacy `mint()` calls in bridge/ingestion path with the canonical entry point.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and the new public `updateAfcReserve()`.
- **`TokenController` canonical endpoint** — expose `POST /api/v1/token/emit` backed by `mintForTransaction()` so external callers use the correct path.
