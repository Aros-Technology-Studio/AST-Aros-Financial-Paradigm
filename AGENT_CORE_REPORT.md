# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-NiVey`  
**Date:** 2026-05-14  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or repair all divergences

---

## 1. Canonical Model (Reference)

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × rate    (default 0.5%)
Node Share   = Commission × 0.75            (75% → node pool, distributed by PoT weight)
AFC Reserve  = Commission × 0.25            (25% → AFC reserve contract)
Burn         = emissionAmount               (ARO destroyed after TX completes)
Net circulating supply change = 0           (mint + burn cancel out per TX cycle)

AFC Reserve Index = 1.0 + sqrt(totalAfcReserve) / 10_000
  → sub-linear growth; rises monotonically as reserve accumulates
```

---

## 2. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State | Notes |
|------|-------|-------|
| `coin_emission_model.md` | ✅ Canonical | Formulas, example, AFC index all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence, formulas, invariants correct |
| `payment_distribution.md` | ✅ Canonical | 75/25 split with historical note on superseded 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Compatible | General burn-on-withdrawal policy; no 1:1 contradiction |
| `burn_mechanism.md` | ✅ Compatible | Correct |
| `README.md` | ✅ Compatible | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: One divergence fixed

| File | Pre-patch state | Action |
|------|----------------|--------|
| `pot_tx_incentive_distribution.md` | ❌ "60% validators, 30% attesters, 10% burn" — diverged from canonical 75/25 | **Rewritten** to canonical 75/25 with historical note |
| `pot_engine_overview.md` | ✅ No emission formulas | Left as-is |
| `pot_tx_validation_logic.md` | ✅ No emission formulas | Left as-is |
| `pot_tx_weighting_model.md` | ✅ Compatible | Left as-is |
| `pot_tx_incentive_distribution.md` | — | **Fixed** — see §4 |

---

### src/token/ — Status: Canonical, endpoint added

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: MINT → FEE_DIST(75%) → FEE_DIST(25%) → BURN (atomic) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT bridge |
| `tokenomics.service.ts` | ✅ Price delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is no-op |
| `token.controller.ts` | ✅ **Added** `POST /api/v1/token/emit` (canonical) and `GET /api/v1/token/emission/price` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

## 3. Changes Made in This Pass

| File | Change |
|------|--------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | Replaced 60/30/10 split with canonical 75/25; updated Python example |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` and `GET /api/v1/token/emission/price` |
| `AGENT_CORE_REPORT.md` | This file — updated to reflect 2026-05-14 audit |

---

## 4. Canonical Model Verification Matrix

| Rule | Canonical Spec | Code State |
|------|----------------|-----------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Canonical endpoint exposed | Yes | ✅ `POST /api/v1/token/emit` wired to `TokenService.mintForTransaction()` |

---

## 5. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1 — no multiplier
  │    commission     = txAmount × rate   // default 0.5%
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT

All four ledger steps execute atomically within a single QueryRunner transaction.
Supply snapshot: totalMinted += emissionAmount, totalBurned += emissionAmount, circulatingSupply unchanged.
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 6. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75 = 37.50 ARO  (split by PoT weight across active validators)
  AFC reserve  = 50 × 0.25 = 12.50 ARO  (locked in reserve contract)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)

Net circulating supply change = 0  (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced slightly higher
```

---

## 7. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`; throws `BadRequestException` if amount ≤ 0)
2. `nodeShare + afcShare == commission` (exact split; no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+=` to `totalReserve`; `sqrt` is monotone)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 8. Open Recommendations

| Priority | Item |
|----------|------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add `AfcReserveEntity` table with upsert after each TX. |
| High | **Wire `mintForTransaction()` into all ingestion paths** — replace direct `mint()` calls in the bridge / crypto-ingestion pipeline with the canonical `POST /emit` endpoint. |
| Medium | **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard. |
| Medium | **Sync epoch AFC to in-memory index** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; add a post-epoch hook to sync the price index. |
| Low | **Deprecation marker on `POST /mint` endpoint** — add `@deprecated` JSDoc and response header `Deprecation: true` to steer callers to `POST /emit`. |
