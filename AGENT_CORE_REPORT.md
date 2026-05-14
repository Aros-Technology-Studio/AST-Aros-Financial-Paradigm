# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-JoYce`  
**Date:** 2026-05-14  
**Task:** Audit ArosCoin emission logic against the canonical model; fix all deviations

---

## 1. Directory Audit

### 01_coin_engine — Documentation only (not deprecated)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Mermaid sequence diagram + canonical formulas |
| `payment_distribution.md` | ✅ 75/25 split documented |
| `burn_and_mint_rules.md` | ✅ Non-contradictory |
| `README.md` | ✅ Architecture overview |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Documentation only

| File | Status |
|------|--------|
| `pot_tx_incentive_distribution.md` | ⚠️ **Fixed** — stated 60/30/10 split; corrected to canonical 75/25 |
| All other `.md` files | ✅ No emission formula conflicts |

Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in docs except the one fixed above.

### src/token/ — Canonical code

| File | Pre-patch state | Action |
|------|----------------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correct | None |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve` was private | Made `updateAfcReserve` public for epoch sync |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved | None |
| `tokenomics.service.ts` | ⚠️ `getCurrentPrice()` returned `processReserve` log1p index, not canonical AFC sqrt index | **Fixed** — now delegates to `EmissionService.getCurrentEmissionPrice()` |
| `token.module.ts` | ✅ `EmissionService` registered and exported | None |

### src/fee_distribution/ — Canonical epoch distribution

| File | Pre-patch state | Action |
|------|----------------|--------|
| `fee_distribution.service.ts` | ⚠️ Recorded AFC reserve to ledger but never updated in-memory `afcReserveState` | **Fixed** — now calls `emissionService.updateAfcReserve(afcReserve)` after each epoch |
| `fee_distribution.module.ts` | ✅ Imports `TokenModule` (which exports `EmissionService`) | None — `EmissionService` already injectable |

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Tracks total process volume; uses log1p index — separate concept from AFC reserve |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state after patch |
|------|---------------|----------------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also split 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC contribution updates price index | Yes | ✅ **Fixed** — `emissionService.updateAfcReserve(afcReserve)` called post-epoch |
| `getCurrentPrice()` returns canonical index | Yes | ✅ **Fixed** — delegates to `EmissionService.getCurrentEmissionPrice()` |

---

## 3. Deviations Found and Fixed

### DEV-01 — `pot_tx_incentive_distribution.md`: wrong split ratios
- **Before:** "Allocate: 60% validators, 30% attesters, 10% burn"
- **After:** "75% node pool (by PoT weight), 25% AFC reserve"
- **File:** `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md`

### DEV-02 — `FeeDistributionService`: epoch AFC share not synced to price index
- **Before:** `distributeRewards()` wrote AFC contribution to ledger only; `EmissionService.afcReserveState` never updated from epoch distributions
- **After:** `emissionService.updateAfcReserve(afcReserve)` called after recording ledger entry
- **File:** `src/fee_distribution/fee_distribution.service.ts`

### DEV-03 — `TokenomicsService.getCurrentPrice()`: wrong index source
- **Before:** Returned `processReserve.getReserveState().reserveIndex` (log1p of total process volume)
- **After:** Returns `emissionService.getCurrentEmissionPrice()` (canonical `1.0 + sqrt(totalAfcReserve) / 10_000`)
- **File:** `src/token/tokenomics.service.ts`

### DEV-04 — `EmissionService.updateAfcReserve`: was private
- Made `public` to allow `FeeDistributionService` to call it without wrapping
- **File:** `src/token/emission.service.ts`

---

## 4. Canonical Lifecycle (Confirmed Correct)

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

All four ledger steps execute atomically within a single QueryRunner transaction.
```

### Epoch-level fee distribution (via FeeDistributionService)

```
distributeRewards(epoch, totalFees, weights)
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.updateAfcReserve(afcReserve)  ← NEW (DEV-02 fix)
  └─ for each node: Ledger VALIDATOR_REWARD → nodeId (by PoT weight)
```

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

## 6. Invariants (All Confirmed)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing — only increases via `updateAfcReserve`
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots restored on boot.
- **Wire `mintForTransaction()` into ingestion/bridge pipeline** — replace remaining `mint()` calls in fiat-deposit paths with the canonical entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard.
- **Float precision** — consider using `BigInt` or `Decimal.js` for production to eliminate floating-point rounding in nodeShare + afcShare sum.
