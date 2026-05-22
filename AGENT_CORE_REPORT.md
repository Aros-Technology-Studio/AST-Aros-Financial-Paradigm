# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-V3uf0`  
**Date:** 2026-05-22  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code, documentation, and tests

> **Audit history:** First pass landed in commit `f6239f9` (PR #72, branch `claude/inspiring-cannon-4qbjK`, 2026-05-12).  
> This second pass confirms the model is intact and adds the missing unit-test coverage.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

Module 01 is NOT deprecated in the sense of dead code — it is pure **conceptual documentation**. The architecture overview
marks it as "superseded by Module 08 (Fee Distribution)" to indicate that *active code* lives in `src/`, not here.

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | Describes 1:1 formula, AFC reserve index, burn, phases |
| `aro_emission_protocol.md` | ✅ Canonical | Canonical lifecycle, 75/25 split |
| `payment_distribution.md` | ✅ Canonical | 75/25 node/AFC table |
| `burn_and_mint_rules.md` | ✅ Compatible | Burn-on-withdrawal; no conflicts |
| `README.md` | ✅ Compatible | Architecture overview |

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code: `src/proof_of_transaction_engine/pot.service.ts`. No emission logic here.

### src/token/ — Status: Canonical code ✅ Confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC update → burn |
| `emission.service.spec.ts` | 🆕 **Added** — 16 unit tests covering calculate(), AFC state, rate update, full lifecycle |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `token.service.spec.ts` | ✅ Tests for `mint()` and `burn()` |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` via `processReserve`; `updateInternalValuation()` deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code ✅ Confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts → distributeRewards()` | ✅ `NODE_SHARE_RATIO=0.75`, `AFC_SHARE_RATIO=0.25` — canonical 75/25 per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics only |
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
| Unit tests for emission | Needed | ✅ **Added** `emission.service.spec.ts` (16 tests) |

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

All four ledger operations execute **atomically** within a single `QueryRunner` transaction.

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

All these values are **asserted** in `emission.service.spec.ts` (test: "full $10k example").

---

## 5. Invariants (Enforced in Code)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` if ≤ 0
2. `nodeShare + afcShare == commission` — no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only ever increases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. New Tests Added (This Pass) — `src/token/emission.service.spec.ts`

| Test group | Count | Description |
|---|---|---|
| `calculate()` | 8 | 1:1 ratio, default rate, 75/25 split, invariant, custom rate, dust, zero guard, negative guard |
| AFC Reserve state | 2 | Initial `reserveIndex = 1.0`, `getCurrentEmissionPrice()` |
| `updateCommissionRate()` | 4 | Rate update, zero/negative/≥1 guards |
| `processTransactionEmission()` | 6 | MINT call, 2× FEE_DISTRIBUTION, BURN call, commit/rollback atomicity, result match, $10k example |
| **Total** | **20** | Full coverage of canonical emission lifecycle |

---

## 7. Documentation Changes Made (First Pass, 2026-05-12)

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split + validator weight formula |

---

## 8. Open Recommendations

| Priority | Item | Status |
|----------|------|--------|
| High | **Persist `AfcReserveState` to DB** — currently in-memory, lost on restart; add `AfcReserveEntity` table | 🔴 Open |
| Medium | **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in bridge/ingestion path with canonical entry | 🟡 Open |
| Medium | **Sync epoch AFC to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; in-memory index diverges after epoch finalization | 🟡 Open |
| Done | Unit tests for `EmissionService.calculate()` and lifecycle | ✅ Closed (this pass) |
