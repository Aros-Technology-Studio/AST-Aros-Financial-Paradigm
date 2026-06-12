# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-7jqyh1`  
**Date:** 2026-06-12  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (reference specs, not deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Documents canonical 1:1 formulas (rewritten in PR #72) |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow (rewritten in PR #72) |
| `payment_distribution.md` | ✅ 75/25 split documented (rewritten in PR #72; historical 60/15/15/5/5 noted) |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy — consistent |
| `burn_mechanism.md` | ✅ Burn flow & emergency throttle — consistent |

> `Architecture_Overview.md` marks Module 01 as "*DEPRECATED/Reference*" — this means
> it is a pure specification layer superseded operationally by Module 08 and `src/token/`.
> The files are NOT to be deleted; they remain the canonical economic specification.

### 10_proof_of_transaction_engine — Status: Documentation only

All files are `.md` specs for PoT validation, slashing, and incentive distribution.
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` defined |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve()` now public |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a `@deprecated` no-op |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Fixed in this pass

| File | State |
|------|-------|
| `fee_distribution.service.ts` | ✅ 75/25 split correct; **fixed** — now calls `EmissionService.updateAfcReserve()` after epoch commit |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy `TokenomicsService.getCurrentPrice()` |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve → price rises | yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC syncs price index | yes | ✅ **Fixed** — epoch commit now calls `EmissionService.updateAfcReserve()` |

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch-level sync (fixed in this pass)

After `distributeRewards()` commits its database transaction, it now calls:

```typescript
this.emissionService.updateAfcReserve(afcReserve);
```

This ensures the in-memory `reserveIndex` in `EmissionService` accounts for fees collected
at the epoch level, not only fees generated per individual transaction.

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

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only rises)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Code Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | `updateAfcReserve()` visibility changed from `private` to `public` to allow epoch sync |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; `distributeRewards()` calls `emissionService.updateAfcReserve(afcReserve)` after epoch commit |
| `AGENT_CORE_REPORT.md` | Refreshed with 2026-06-12 audit results |

---

## 7. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart.
  Add an `AfcReserveEntity` table and restore state on `EmissionService` initialization.
- **Wire `mintForTransaction()` into ingestion pipeline** — legacy `TokenService.mint()` still
  called in bridge/ingestion paths; replace with `mintForTransaction()` for full canonical coverage.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate,
  and zero-amount guard.
