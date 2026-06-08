# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-08 (re-verification pass; prior audit 2026-05-12 → PR #72)  
**Task:** Full re-audit of ArosCoin emission logic against canonical model; confirm all corrections from prior pass remain intact

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Pre-patch content | Action taken |
|------|------------------|--------------|
| `coin_emission_model.md` | Described `E = F / N` (fee ÷ nodes) — diverged from canonical 1:1 | **Rewritten** to canonical model |
| `aro_emission_protocol.md` | `EMISSION_AMOUNT = Σ(load × index × ratio)` — diverged | **Rewritten** to canonical formulas |
| `payment_distribution.md` | 60/15/15/5/5 multi-actor split — diverged from canonical 75/25 | **Rewritten** to 75/25 |
| `burn_and_mint_rules.md` | Correct general burn-on-withdrawal policy; no 1:1 mention | Left as-is (non-contradictory) |
| `README.md` | Architecture overview; no formula conflicts | Left as-is |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

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
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

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

## 6. Documentation Changes Made in This Pass

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split; added validator weight formula |

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add a `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.

---

## 8. Re-verification Pass — 2026-06-08

**Trigger:** AGENT-CORE re-audit requested on branch `agent/core-emission`.

### Files inspected

| File | Lines verified | Status |
|------|---------------|--------|
| `src/token/emission.service.ts` | 1–231 | ✅ Canonical — all formulas intact |
| `src/token/emission.interfaces.ts` | 1–21 | ✅ Interfaces correct |
| `src/token/token.service.ts` | 1–221 | ✅ `mintForTransaction()` delegates to `EmissionService` |
| `src/token/tokenomics.service.ts` | 1–52 | ✅ `updateInternalValuation()` is deprecated no-op |
| `01_coin_engine/coin_emission_model.md` | 1–85 | ✅ Spec matches implementation |

### 2026-06-08 canonical rule check

| Rule | Expected | Actual (code) | Result |
|------|----------|---------------|--------|
| `emission = txAmount` | 1:1 | `const emission = transactionAmount` (line 58) | PASS |
| `commission = txAmount × 0.005` | 0.5% | `transactionAmount * rate` (rate defaults to 0.005) | PASS |
| `nodeShare = commission × 0.75` | 75% | `commission * this.config.nodeShareRatio` (0.75) | PASS |
| `afcShare = commission × 0.25` | 25% | `commission * this.config.afcReserveRatio` (0.25) | PASS |
| MINT to recipient | Yes | `TransactionType.MINT`, recipient (lines 102–110) | PASS |
| FEE_DISTRIBUTION 75% → NODE_POOL | Yes | Lines 113–121 | PASS |
| FEE_DISTRIBUTION 25% → AFC_RESERVE | Yes | Lines 124–132 | PASS |
| AFC index = `1.0 + sqrt(reserve) / 10_000` | Yes | Lines 175–176 | PASS |
| BURN emissionAmount post-TX | Yes | Lines 138–146 | PASS |
| Net supply Δ = 0 | Yes | `circulatingSupply = prevSupply` (line 226) | PASS |
| Atomic rollback on error | Yes | Single QueryRunner, `rollbackTransaction()` on catch | PASS |

**Conclusion: all 11 canonical rules pass. No corrections required. Implementation is compliant.**

### Module 01 deprecation status (re-confirmed)

`01_coin_engine/` remains documentation-only as of this pass. `coin_emission_model.md` correctly references `src/token/emission.service.ts` as the implementation authority. No orphaned code found in Module 01.

*Re-verification completed by AGENT-CORE. No code changes made.*
