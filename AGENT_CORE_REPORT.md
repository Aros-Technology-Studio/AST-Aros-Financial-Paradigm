# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-64BOm`  
**Date:** 2026-05-12  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation  
**Previous work:** Canonical emission originally landed in `agent/core-emission` → merged PR #72

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC reserve index, example documented |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid flow diagram, all four ledger steps, invariants |
| `payment_distribution.md` | ✅ Canonical | 75/25 split; historical note about old 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Unchanged | General burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ Unchanged | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct ratios (0.75/0.25) |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic 4-step ledger transaction |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for backward compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: `NODE_SHARE_RATIO=0.75`, `AFC_SHARE_RATIO=0.25` per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
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
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` — `NODE_SHARE_RATIO=0.75`, `AFC_SHARE_RATIO=0.25` |

**All seven rules confirmed correct. No divergence found.**

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
  ├─ QueryRunner.startTransaction()
  │
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
  ├─ updateSupplySnapshot()  // totalMinted += emission; totalBurned += emission; circulatingSupply unchanged
  │
  └─ QueryRunner.commitTransaction()  // atomic — rollback on any failure
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

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` if `txAmount <= 0`
2. `nodeShare + afcShare == commission` — exact split at float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing — grows with `sqrt(totalReserve)`, never decreases
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Recommendations (outstanding)

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add `AfcReserveEntity` with periodic snapshots. |
| HIGH | **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in bridge/ingestion path with the canonical entry point. |
| MEDIUM | **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard. |
| LOW | **Sync epoch AFC → `EmissionService`** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing in-memory index after each epoch finalization. |
