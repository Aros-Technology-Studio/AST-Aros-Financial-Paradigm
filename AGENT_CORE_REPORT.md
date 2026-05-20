# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-22VuF`  
**Date:** 2026-05-20  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## Previous Run (2026-05-12, PR #72 / `agent/core-emission`)

The first agent pass implemented the canonical `EmissionService` in `src/token/` and rewrote three
divergent docs in `01_coin_engine/`. Full detail preserved in git history (`f6239f9`).

---

## This Run — Audit & Remaining Fixes

### 1. Directory Audit

#### 01_coin_engine — Status: Documentation only, fully canonical after PR #72

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical protocol; sequence diagram; allocation flow |
| `payment_distribution.md` | ✅ 75/25 canonical split documented; historical 60/15/15/5/5 note preserved |
| `burn_and_mint_rules.md` | ✅ Correct; no conflicts |
| `README.md` | ✅ Architecture overview; no conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

---

#### 10_proof_of_transaction_engine — Status: ONE discrepancy found and fixed

| File | Pre-patch state | Action |
|------|----------------|--------|
| `pot_tx_incentive_distribution.md` | ❌ `60% validators / 30% attesters / 10% burn` — conflicts with canonical 75/25 | **Rewritten** to canonical 75/25 + per-node PoT weight sub-distribution |
| All other `.md` files | ✅ No emission-formula conflicts | Left as-is |

Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in module 10.

---

#### src/token/ — Status: Canonical code verified correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic 4-step ledger sequence |
| `token.service.ts` | ✅ `mintForTransaction()` is canonical entry point; legacy `mint()` preserved for fiat bridge |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` proxies `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a documented deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

#### src/fee_distribution/ — Status: Correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25`; both applied at epoch finalization |

---

#### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Process-volume ledger; `reserveIndex` via `log1p` — used by legacy `TokenomicsService.getCurrentPrice()` |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

### 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `totalMinted += emissionAmount; totalBurned += emissionAmount; circulatingSupply unchanged` |

---

### 3. Implementation Detail

#### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient           [Step 1]
  ├─ Ledger FEE_DISTRIBUTION: nodeShare(75%) → SYSTEM_NODE_POOL   [Step 2a]
  ├─ Ledger FEE_DISTRIBUTION: afcShare(25%) → SYSTEM_AFC_RESERVE  [Step 2b]
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000           [Step 3]
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT  [Step 4]
     (all within single QueryRunner transaction — atomic)
```

#### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

### 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight across validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out in same atomic cycle)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced at this index
```

---

### 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact floating-point split, no loss beyond precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+=`, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

### 6. Changes Made in This Run

| File | Change |
|------|--------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | Replaced non-canonical `60/30/10` split with canonical 75/25 + PoT weight sub-distribution; added historical note |
| `AGENT_CORE_REPORT.md` | Updated with this run's findings (2026-05-20) |

---

### 7. Open Recommendations (carry-over from previous run)

| Priority | Recommendation |
|----------|---------------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; resets on service restart. Add `AfcReserveEntity` table with periodic upsert. |
| Medium | **Wire `mintForTransaction()` into ingestion pipeline** — `TokenController` still exposes legacy `/mint` endpoint calling `mint()`. Canonical emission entry point should be preferred for all transaction-driven flows. |
| Medium | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max/min commission rate, zero-amount guard, and exact float split invariants. |
| Low | **Sync epoch AFC to `EmissionService.updateAfcReserve()`** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()` after epoch finalization; the in-memory `reserveIndex` may drift from ledger reality between restarts. |
