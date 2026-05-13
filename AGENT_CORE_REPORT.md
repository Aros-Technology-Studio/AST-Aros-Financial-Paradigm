# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-0xOfp`  
**Date:** 2026-05-13  
**Task:** Audit ArosCoin emission logic against the canonical model, close any remaining gaps, align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index — previously rewritten ✅ |
| `aro_emission_protocol.md` | Canonical 1:1 + 75/25 + burn flow — previously rewritten ✅ |
| `payment_distribution.md` | Canonical 75/25 split + validator weight formula — previously rewritten ✅ |
| `burn_and_mint_rules.md` | Non-contradictory — left unchanged ✅ |
| `README.md` | Architecture overview — left unchanged ✅ |

**Module 01 is NOT deprecated** — pure specification documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct separation.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve()` now **public** |
| `token.service.ts` | ✅ `mintForTransaction()` is canonical entry point; legacy `mint()` preserved for fiat bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a correct no-op; `getCurrentPrice()` delegates to `ProcessReserveLedgerService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Gap closed in this pass

| File | Action |
|------|--------|
| `fee_distribution.service.ts` | **Fixed**: `EmissionService` injected; `updateAfcReserve(afcReserve)` now called after every epoch AFC ledger record |

**Gap that existed:** `distributeRewards()` was recording 25% of epoch fees to `SYSTEM_AFC_RESERVE_*` on the ledger, but never calling `EmissionService.updateAfcReserve()`. This meant the in-memory reserve index (used to price subsequent emissions) was blind to all epoch-level accumulation — only per-transaction emissions updated it.

**Fix applied:** `EmissionService.updateAfcReserve()` changed from `private` to `public`; `EmissionService` injected into `FeeDistributionService`; call added in `distributeRewards()` immediately after the AFC ledger save.

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy process-volume ledger used by `TokenomicsService.getCurrentPrice()` |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC share updates price index | Yes | ✅ **Fixed this pass** — `emissionService.updateAfcReserve()` called after epoch AFC record |

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
  ├─ updateAfcReserve(afcShare):         // public — also called by FeeDistributionService
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch finalization (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees * 0.75
  ├─ afcReserve = totalFees * 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE  (was already here)
  ├─ emissionService.updateAfcReserve(afcReserve)               // NEW — price index sync
  └─ For each node: Ledger VALIDATOR_REWARD = nodePool * weight
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
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve; updates reserveIndex)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (updated by both per-TX and epoch-level paths)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | `updateAfcReserve()` visibility changed from `private` → `public` |
| `src/fee_distribution/fee_distribution.service.ts` | Added `EmissionService` import and constructor injection; added `emissionService.updateAfcReserve(afcReserve)` call in `distributeRewards()` |
| `AGENT_CORE_REPORT.md` | Updated with 2026-05-13 audit results |

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table and seed `EmissionService` from it on startup.
- **Wire `mintForTransaction()` into ingestion pipeline** — `IngestionService.ingestAsset()` has a commented-out `tokenService.mint()` call; replace with `tokenService.mintForTransaction()` when the ingestion path is activated.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, and zero-amount guard.
- **Add unit test for `FeeDistributionService.distributeRewards()`** — verify `emissionService.updateAfcReserve` is called with the correct 25% amount after each epoch finalization.
