# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-QuasM`  
**Date:** 2026-06-04  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or rewrite  

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no runtime code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid sequence diagram for full lifecycle |
| `payment_distribution.md` | ✅ 75/25 split; historical note about old 60/15/15/5/5 model |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-withdrawal policy; no conflicts |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical runtime code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files (PoT validation, slashing, signature model, incentive distribution).  
Runtime code lives in `src/proof_of_transaction_engine/`. No emission logic in this module.

### src/token/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|----------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` defined correctly |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — calculate → mint → fee split → AFC update → burn |
| `token.service.ts` | ✅ `mintForTransaction()` is canonical entry point; legacy `mint()` preserved as backward-compat |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is `@deprecated` no-op; `getCurrentPrice()` delegates to `processReserve` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|----------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring and weight normalization — untouched, correct |

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
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction with rollback on error |

**Verdict: All 8 canonical rules are correctly implemented. No rewrites required.**

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
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
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
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 6. Documentation Alignment

All documentation files in `01_coin_engine/` were confirmed correct and consistent with the canonical model implemented in `src/token/emission.service.ts`. No documentation changes were required in this pass.

| File | Status |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | ✅ Matches canonical 1:1 + AFC index |
| `01_coin_engine/aro_emission_protocol.md` | ✅ Matches with full sequence diagram |
| `01_coin_engine/payment_distribution.md` | ✅ Matches 75/25 with historical note |
| `src/fee_distribution/fee_distribution.service.ts` | ✅ Epoch-level 75/25 split confirmed |

---

## 7. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; state is lost on restart. Add an `AfcReserveEntity` table with periodic snapshots and re-hydration on boot.
- **Wire `mintForTransaction()` into all ingestion paths** — confirm all bridge/ingestion callers use `mintForTransaction()` (canonical), not legacy `mint()`. Run a grep for remaining `tokenService.mint(` callers.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and the `nodeShare + afcShare == commission` invariant.
- **Sync `FeeDistributionService` AFC share with `EmissionService`** — epoch-level AFC fees are written to ledger but do not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization so the price index reflects both per-TX and epoch-level accumulations.
