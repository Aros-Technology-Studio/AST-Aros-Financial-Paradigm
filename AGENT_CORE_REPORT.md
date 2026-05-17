# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-17  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical — documents 1:1, 0.5% commission, 75/25 split, AFC index formula |
| `aro_emission_protocol.md` | ✅ Canonical — full sequenceDiagram, formula block, invariants |
| `payment_distribution.md` | ✅ Canonical — 75/25 table, historical note on replaced 60/15/15/5/5 split |
| `burn_and_mint_rules.md` | ✅ Non-contradictory burn policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

All `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct + controller gap fixed

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC update → burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; `getCurrentPrice()` readable |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ✅ **NEW** `POST /api/v1/token/emission` routes to canonical `mintForTransaction()` |

### src/fee_distribution/ — Status: Correct, unchanged

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; used by legacy tokenomics pricing |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| HTTP endpoint for canonical emission | Yes | ✅ **Added** `POST /api/v1/token/emission` |

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

### New HTTP Endpoint (`src/token/token.controller.ts`)

```
POST /api/v1/token/emission
Body: { transactionAmount: number, recipient: string, referenceId: string, commissionRate?: number }
→ calls TokenService.mintForTransaction()
→ returns EmissionResult
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per active validator)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
Burn           = 10,000 ARO  (SYSTEM_BURN_VAULT — ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out per TX cycle)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on ≤ 0)
2. `nodeShare + afcShare == commission` (exact 75/25 split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emission` → `mintForTransaction()` canonical entry point |
| `AGENT_CORE_REPORT.md` | Updated with this audit pass (2026-05-17) |

---

## 7. Outstanding Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Sync epoch AFC contributions into `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Deprecate legacy `POST /api/v1/token/mint`** — the legacy `mint()` path bypasses fee splitting and burning; callers should migrate to `/emission`.
