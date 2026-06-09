# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-y58q47`  
**Date:** 2026-06-09  
**Task:** Audit ArosCoin emission logic against the canonical model and confirm full alignment

---

## 1. Directory Audit

### 01_coin_engine — Status: Deprecated (documentation reference only)

`README.md` line 31 explicitly marks this module: `*(Deprecated)* Conceptual economic specifications.`  
The module contains no source code. Its markdown files serve as reference documentation; the canonical emission code lives in `src/token/emission.service.ts`.

| File | Content state |
|------|--------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid sequence diagram of full lifecycle |
| `payment_distribution.md` | ✅ Canonical 75/25 split; historical note on superseded 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy |
| `burn_mechanism.md` | ✅ Consistent with canonical burn-after-TX rule |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is marked Deprecated.** It is pure documentation; actual emission logic has migrated to `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct ratios (0.75 / 0.25) |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: MINT → FEE_DISTRIBUTION (75% nodes) → FEE_DISTRIBUTION (25% AFC) → updateAfcReserve → BURN — all atomic |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService.processTransactionEmission()`; legacy `mint()` preserved for backward compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` | ✅ `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25`; `distributeRewards()` applies canonical 75/25 split at epoch finalization |

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
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (`defaultCommissionRate: 0.005`) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` with same constants |
| Atomic execution | Yes | ✅ All four ledger steps in a single `QueryRunner` transaction; rolled back on failure |

**All 8 canonical rules: PASS.**

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
       (all within one QueryRunner — atomic)
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight across validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel each other)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants (verified in code)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split (float precision only)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (`sqrt` is non-decreasing, totalReserve only grows)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. History

| Date | Event |
|------|-------|
| 2026-05-12 | `agent/core-emission` branch created; emission logic rewritten to canonical 1:1 model; documentation in `01_coin_engine/` updated |
| 2026-05-12 | PR #72 merged — canonical emission model landed on `main` |
| 2026-06-09 | Re-audit on `claude/inspiring-cannon-y58q47` — **all code and documentation confirmed correct; no changes required** |

---

## 7. Outstanding Recommendations (carry-forward from prior audit)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in bridge/ingestion with the canonical entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Epoch AFC → EmissionService sync** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
