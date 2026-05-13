# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-4RW0H`  
**Date:** 2026-05-13  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code, NOT deprecated)

| File | Pre-audit content | Action taken |
|------|------------------|--------------|
| `coin_emission_model.md` | Canonical 1:1 formula, AFC reserve index, example | ✅ Confirmed correct |
| `aro_emission_protocol.md` | Canonical 1:1 + 75/25 + burn flow | ✅ Confirmed correct |
| `payment_distribution.md` | Canonical 75/25 split; validator weight formula | ✅ Confirmed correct |
| `burn_and_mint_rules.md` | Burn-on-completion policy; consistent with canonical | ✅ No changes needed |
| `README.md` | Architecture overview; no formula conflicts | ✅ No changes needed |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic is defined here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct fields |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat bridge compatibility |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is marked `@deprecated` as a no-op; `getCurrentPrice()` reads `processReserve.reserveIndex` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies canonical 75/25 split per epoch: 75% node pool, 25% AFC reserve |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy `tokenomics.service.ts` only |
| `pot.service.ts` | PoT scoring (alpha·txCount + beta·fees − delta·penalty) and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code Status |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (default `0.005`) |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change per TX | 0 | ✅ `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` |

**Result: Code fully matches the canonical model. No rewrites required.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount            // 1:1
  │    commission     = txAmount × rate     // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:              emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION:  nodeShare  → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION:  afcShare   → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:              emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.  
On any failure: full rollback, error re-thrown to caller.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### Epoch-Level Distribution (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  └─ For each node:
       reward = nodePool × weight_i        // PoT-normalized weight
       Ledger VALIDATOR_REWARD: reward → nodeId
```

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight across validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve contract)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out in same atomic TX)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher (sub-linear growth)
```

---

## 5. Invariants Verified

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on non-positive input
2. `nodeShare + afcShare == commission` — exact 75/25 split, no rounding leakage beyond float precision
3. `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` — net zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — only grows via `sqrt(totalReserve)`, never decreases
5. All four ledger operations succeed or all roll back — atomic `QueryRunner` transaction
6. Governance can adjust commission rate via `updateCommissionRate(newRate)` — validated to be in `(0, 1)` exclusive

---

## 6. Canonical Entry Points

| Method | Location | Purpose |
|--------|----------|---------|
| `EmissionService.calculate()` | `src/token/emission.service.ts:52` | Pure calculation — no side effects |
| `EmissionService.processTransactionEmission()` | `src/token/emission.service.ts:82` | Full canonical lifecycle |
| `TokenService.mintForTransaction()` | `src/token/token.service.ts:45` | Public entry point; delegates to EmissionService |
| `EmissionService.getAfcReserveState()` | `src/token/emission.service.ts:187` | Current reserve snapshot (read-only) |
| `EmissionService.getCurrentEmissionPrice()` | `src/token/emission.service.ts:195` | Current `reserveIndex` |
| `FeeDistributionService.distributeRewards()` | `src/fee_distribution/fee_distribution.service.ts:151` | Epoch-level 75/25 fee split |

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots keyed by epoch number.
- **Wire `mintForTransaction()` into all ingestion paths** — the legacy `mint()` in `TokenService` does not apply commission, does not burn, and does not update AFC reserve. Ensure all production TX paths use `mintForTransaction()`.
- **Sync epoch AFC contributions back to EmissionService** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`. Consider syncing the in-memory index after each epoch finalization to keep `reserveIndex` accurate across lifecycle events.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard, and extreme reserveIndex values.
