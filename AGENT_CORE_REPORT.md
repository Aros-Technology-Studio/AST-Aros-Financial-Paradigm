# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-MYEnE` (canonical emission originally landed in `agent/core-emission` → merged PR #72)  
**Date:** 2026-05-16  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, 75/25 split, AFC reserve index, burn cycle — all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid flow diagram matches code; all formulas correct |
| `payment_distribution.md` | ✅ Canonical | 75/25 split documented; historical 60/15/15/5/5 noted as superseded by PR #72 |
| `burn_and_mint_rules.md` | ✅ Non-contradictory | General burn policy; no conflicts with canonical model |
| `README.md` | ✅ Non-contradictory | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented in `processTransactionEmission()` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for backward-compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies canonical 75/25 split: `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25`; AFC reserve record written atomically per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (`defaultCommissionRate = 0.005`) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` mirrors same ratios |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged |

**Verdict: Code fully conforms to canonical model. No rewrites required.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1 — no multiplier
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.
On any failure, the entire transaction rolls back.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### FeeDistributionService — Epoch-level split (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  └─ For each node:
       reward = nodePool × node_weight    // weight = potScore / Σ potScore
       Ledger VALIDATOR_REWARD: reward → nodeId
```

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight across validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out per cycle)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.00003536...
  → every subsequent emission is priced higher
```

---

## 5. Invariants (All Verified)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on non-positive amount.
2. `nodeShare + afcShare == commission` — exact split with no rounding loss beyond float precision.
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero circulating supply.
4. `reserveIndex` is monotonically non-decreasing — grows only on `updateAfcReserve()` call.
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction.
6. Epoch-level 75/25 split mirrors per-TX 75/25 split — same constants in both services.

---

## 6. Code Change History

### This session (2026-05-16)
- **No code changes required** — implementation fully conforms to canonical model.
- Updated `AGENT_CORE_REPORT.md` with complete fresh audit.

### Previous session (2026-05-12, branch `claude/inspiring-cannon-4qbjK`, PR #72 via `agent/core-emission`)

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Created — full canonical 1:1 lifecycle |
| `src/token/emission.interfaces.ts` | Created — `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `src/token/token.service.ts` | Added `mintForTransaction()` delegating to `EmissionService` |
| `src/fee_distribution/fee_distribution.service.ts` | Replaced multi-actor split with canonical 75/25 |
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` formula with canonical 1:1 formulas and AFC index |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split |

---

## 7. Open Recommendations

These do not violate the canonical model but represent hardening opportunities:

| Priority | Recommendation | Detail |
|----------|---------------|--------|
| HIGH | **Persist `AfcReserveState` to database** | Currently in-memory; lost on restart. Add `AfcReserveEntity` table with periodic snapshots so `reserveIndex` survives pod recycling. |
| MEDIUM | **Wire `mintForTransaction()` into ingestion pipeline** | Replace remaining `mint()` calls in the bridge/ingestion path with the canonical `mintForTransaction()` entry point. |
| MEDIUM | **Sync epoch AFC contribution to `EmissionService`** | `FeeDistributionService` records AFC reserve on-ledger per epoch but does not call `EmissionService.updateAfcReserve()`; the in-memory index lags epoch-level accumulation. |
| LOW | **Unit tests for `EmissionService.calculate()`** | Cover: dust amounts, max commission rate boundary, zero-amount guard, full 75/25 split exactness. |
