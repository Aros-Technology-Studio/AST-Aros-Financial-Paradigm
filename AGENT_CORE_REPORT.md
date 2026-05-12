# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-Lxnlb`  
**Date:** 2026-05-12  
**Task:** Full audit of ArosCoin emission logic against the canonical model; identify divergences and enforce alignment

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example transaction |
| `aro_emission_protocol.md` | ✅ Canonical formulas, mermaid flow diagram, 75/25 split, atomic 4-step flow |
| `payment_distribution.md` | ✅ 75/25 canonical split; validator-level sub-distribution by PoT weight |
| `burn_and_mint_rules.md` | ✅ Non-contradictory burn-on-completion policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all aligned |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `recordAfcEpochContribution()` added this session |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for backward compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Fixed this session

| File | Change |
|------|--------|
| `fee_distribution.service.ts` | **Fixed**: injected `EmissionService`; now calls `emissionService.recordAfcEpochContribution(afcReserve)` after epoch AFC ledger entry |

**Gap closed**: Previously, epoch-level AFC fees were recorded on the ledger but the in-memory `EmissionService.afcReserveState` was not updated, causing `getCurrentEmissionPrice()` to under-report the true price index. Now both per-TX and per-epoch AFC contributions flow through the same `updateAfcReserve()` accumulator.

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Process volume ledger; used by legacy `tokenomics.getCurrentPrice()` path — separate from canonical emission price |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic DB transaction |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC syncs emission price index | Yes | ✅ **Fixed this session** — `emissionService.recordAfcEpochContribution()` called after each epoch |

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

recordAfcEpochContribution(afcAmount)   ← new (called by FeeDistributionService)
  └─ updateAfcReserve(afcAmount)         // same accumulator, keeps index consistent
```

All four per-TX ledger operations execute atomically within a single `QueryRunner` transaction.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked; updates reserveIndex)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on ≤ 0)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases via `updateAfcReserve()`)
5. All four per-TX ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. `reserveIndex` now reflects **both** per-TX and per-epoch AFC contributions (fixed this session)

---

## 6. Changes Made in This Session

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added `recordAfcEpochContribution(afcAmount)` public method |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; called `recordAfcEpochContribution()` after epoch AFC ledger entry |
| `AGENT_CORE_REPORT.md` | Refreshed to reflect current session audit and fix |

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database**: currently in-memory; restarting the node resets `reserveIndex` to 1.0. Add an `AfcReserveEntity` table with a snapshot saved after each `updateAfcReserve()` call and a bootstrap loader on startup.
- **Wire `mintForTransaction()` into the ingestion pipeline**: `IngestionService.ingestAsset()` has a commented-out `tokenService.mint()` call; replace it with `tokenService.mintForTransaction()` once the ingestion module is wired to the token module.
- **Add unit tests for `EmissionService.calculate()`**: cover dust amounts, maximum commission rate boundary, zero-amount guard, and multi-epoch AFC accumulation.
