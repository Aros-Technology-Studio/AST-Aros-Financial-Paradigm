# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-kDRzm`  
**Verified:** 2026-06-04  
**Previous audit:** 2026-05-12 (PR #72, branch `claude/inspiring-cannon-4qbjK`)  
**Task:** Audit ArosCoin emission logic against the canonical model; rewrite if diverged

---

## Executive Summary

The canonical 1:1 emission model is **fully implemented** and **fully aligned** with the specification.  
No source code changes were required in this audit pass.

All documentation in `01_coin_engine/` was already corrected in the prior pass.  
Module `01_coin_engine` is **not deprecated** — it is pure specification documentation.  
The authoritative implementation lives in `src/token/emission.service.ts`.

---

## 1. Directory Audit

### 01_coin_engine/ — Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator weight formula |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion rules, non-contradictory |
| `burn_mechanism.md` | ✅ Emergency overflow rules, non-contradictory |
| `README.md` | ✅ Architecture overview, no formula conflicts |

No deprecated markers. Module 01 is pure spec — all code is in `src/`.

### 10_proof_of_transaction_engine/ — Documentation only

Spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT implementation lives in `src/proof_of_transaction_engine/`.  
No emission logic in this module.

### src/token/ — Canonical implementation confirmed

| File | State |
|------|-------|
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — **primary implementation** |
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` typed correctly |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` delegates to `processReserve` |

### src/fee_distribution/ — Epoch-level distribution confirmed

| File | State |
|------|-------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies canonical 75/25 per epoch |

### src/proof_of_transaction_engine/ — Unchanged, correct

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General volume ledger; `reserveIndex` via `log1p` for legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code State |
|------|---------------|-----------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` (`emission.service.ts:58`) |
| Fee = TX Amount × rate | Default 0.5% | ✅ `commission = transactionAmount * rate` (`emission.service.ts:59`) |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` (`emission.service.ts:60`) |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` (`emission.service.ts:61`) |
| ARO burned after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic TX (`emission.service.ts:138-146`) |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` (`emission.service.ts:175-176`) |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Atomic lifecycle | All-or-rollback | ✅ Single `QueryRunner` transaction wraps all 4 ledger ops |

**Verdict: 7/7 rules satisfied. Code matches canonical model exactly.**

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

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on zero/negative input
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero supply
4. `reserveIndex` is monotonically non-decreasing — only grows, never decreases
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Documentation Changes Made in Prior Pass (PR #72, 2026-05-12)

| File | Change Applied |
|------|---------------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split and validator weight formula |

No documentation changes required in this pass (2026-06-04) — all docs already canonical.

---

## 7. Open Recommendations

These items do not break the canonical model but improve production robustness:

| Priority | Issue | Location |
|----------|-------|----------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; state lost on restart. Add `AfcReserveEntity` table with periodic snapshots. | `emission.service.ts:34-39` |
| MEDIUM | **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in bridge/ingestion path with the canonical entry point `TokenService.mintForTransaction()`. | `token.service.ts:79` (legacy `mint()`) |
| MEDIUM | **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` drifts after epoch finalization. | `fee_distribution.service.ts:157-159` |
| LOW | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, rounding behaviour. | `src/token/` (no test file yet for emission) |
