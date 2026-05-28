# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-i9Wlu`  
**Date:** 2026-05-28  
**Task:** Audit and align ArosCoin emission logic against the canonical model

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow, Mermaid sequence diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split, validator weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; covers general burn-on-withdrawal |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code verified ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields aligned |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve` now public for epoch sync |
| `emission.service.spec.ts` | ✅ **NEW** — 20 unit tests covering `calculate()`, AFC index, full lifecycle, rollback |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is `@deprecated` no-op; canonical price from `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered, provided, and exported |

### src/fee_distribution/ — Status: Fixed ✅

| File | Change |
|------|--------|
| `fee_distribution.service.ts` | **Fixed:** `EmissionService` now injected; `updateAfcReserve(afcReserve)` called after each epoch AFC ledger record so `reserveIndex` reflects epoch-level fees |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy `reserveIndex` via `log1p`; used only by `TokenomicsService.getCurrentPrice()` (legacy `mint()` path) — not the canonical price |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

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
| Epoch AFC syncs `reserveIndex` | Yes | ✅ **Fixed this run** — `emissionService.updateAfcReserve()` called post-epoch |

---

## 3. Changes Made in This Run

### 3.1 `src/token/emission.service.ts`

`updateAfcReserve()` changed from `private` to `public`.  
This exposes the method so `FeeDistributionService` can sync epoch-level AFC contributions into the canonical `reserveIndex`, closing the gap where per-epoch fees did not affect the emission price index.

### 3.2 `src/fee_distribution/fee_distribution.service.ts`

- `EmissionService` injected as constructor dependency.
- `distributeRewards()` calls `this.emissionService.updateAfcReserve(afcReserve)` immediately after the AFC reserve ledger record, ensuring the in-memory `reserveIndex` in `EmissionService` reflects both per-transaction and per-epoch AFC accumulation.

### 3.3 `src/token/emission.service.spec.ts` (NEW)

20 unit tests covering:
- `calculate()` canonical formulas for $10k example
- Custom commission rate
- Guard conditions (zero/negative amount)
- Dust amounts ($0.01 transaction)
- AFC reserve index growth and monotonicity
- `updateCommissionRate()` valid and invalid inputs
- `processTransactionEmission()` full lifecycle (4 ledger calls, correct amounts, atomic rollback)

---

## 4. Implementation Detail

### EmissionService — Canonical lifecycle

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount  → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare (75%) → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  (25%) → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount  → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch sync (fixed)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.updateAfcReserve(afcReserve)  ← NEW
  └─ Ledger VALIDATOR_REWARD: nodePool × weight_i → each node
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 5. Example: $10,000 Transaction

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

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only `updateAfcReserve()` mutates it, always adds)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. Epoch-level AFC fees now also increment `reserveIndex` (closed gap in this run)

---

## 7. Outstanding Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots keyed to epoch number.
- **Wire `mintForTransaction()` into ingestion pipeline** — the bridge/ingestion path still calls legacy `mint()`. Replace with canonical entry point to ensure all token flows apply the 1:1 model.
- **Governance bounds on commission rate** — `updateCommissionRate()` accepts any rate in (0,1); add protocol-defined floor/ceiling (e.g. 0.1% – 2%) enforced via governance contract.
