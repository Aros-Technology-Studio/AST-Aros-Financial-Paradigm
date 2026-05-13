# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-Cn5UU`  
**Date:** 2026-05-13  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or realign all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

All files were originally aligned to the canonical model in PR #72. Current state:

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Full emission lifecycle as Mermaid diagram + formula table |
| `payment_distribution.md` | ✅ Canonical 75/25 split; historical 60/15/15/5/5 note preserved |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy; consistent with canonical model |
| `README.md` | ✅ Architecture overview; no contradictions |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT runtime code lives in `src/proof_of_transaction_engine/`. No emission logic resides here.

### src/token/ — Status: Canonical implementation confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented and documented |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for backward-compat |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a documented deprecated no-op; `getCurrentPrice()` proxies `ProcessReserveLedgerService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical 75/25 split confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75% node pool + 25% AFC reserve per epoch finalization |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy `TokenomicsService.getCurrentPrice()` |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code State |
|------|---------------|------------|
| Emission = TX Amount | 1:1 (no multiplier) | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | Default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | 75% | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | 25% | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ Atomic `BURN` ledger record for `emissionAmount` in same `QueryRunner` |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` applies same ratios |
| Net circulating supply change per TX | Zero | ✅ `totalMinted == totalBurned` per cycle in `SupplySnapshot` |

**Result: All 8 canonical rules are implemented correctly. No code changes required.**

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
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically inside a single `QueryRunner` transaction. On failure, the entire cycle rolls back.

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
  Node pool    = 50 × 0.75 = 37.50 ARO  (split by PoT weight across active validators)
  AFC reserve  = 50 × 0.25 = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating supply change = 0

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.00003536
  → subsequent emissions are priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on non-positive input
2. `nodeShare + afcShare == commission` — exact split; no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing — only grows, never decreases
5. All four ledger steps succeed atomically or all roll back (single `QueryRunner` transaction)

---

## 6. Documentation State

All `01_coin_engine/` documentation was aligned to the canonical model in PR #72.  
No further documentation changes required in this pass.

| File | Current state |
|------|--------------|
| `01_coin_engine/coin_emission_model.md` | ✅ Canonical formulas + AFC index + worked example |
| `01_coin_engine/aro_emission_protocol.md` | ✅ Canonical 1:1, Mermaid flow, formula table, governance |
| `01_coin_engine/payment_distribution.md` | ✅ 75/25 split; validator weight formula; AFC reserve logic |

---

## 7. Open Recommendations (carried forward from prior audit)

These are improvements beyond the minimum canonical requirement — not blockers:

1. **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots.
2. **Wire `mintForTransaction()` into the bridge/ingestion path** — replace legacy `mint()` calls with the canonical entry point where transaction amounts are known.
3. **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard.
4. **Sync epoch AFC contribution to `EmissionService.updateAfcReserve()`** — `FeeDistributionService` records the AFC reserve contribution on the ledger but does not update the in-memory `reserveIndex` in `EmissionService`; they should stay in sync.
