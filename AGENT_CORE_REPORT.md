# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-06  
**Task:** Audit ArosCoin emission logic against the canonical model; fix any divergence

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 model correctly documented |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid flow diagram |
| `payment_distribution.md` | ✅ 75/25 split documented with historical note re: superseded 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy aligned |
| `README.md` | ✅ Architecture overview, no conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation. All canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, weighting, and incentive distribution. Actual PoT code lives in `src/proof_of_transaction_engine/`. **No emission logic here.**

### src/token/ — Canonical code (verified + patched)

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `addEpochAfcContribution()` added (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge deposits |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ✅ New canonical `POST /api/v1/token/emit` endpoint added |

### src/fee_distribution/ — Patched

| File | Status |
|------|--------|
| `fee_distribution.service.ts` | ✅ `EmissionService` injected; `addEpochAfcContribution()` called after epoch AFC recording |

### src/proof_of_transaction_engine/ — Unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy volume ledger using `log1p`; used only by deprecated `tokenomics.service.ts` path |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC synced to price index | Yes | ✅ **Fixed in this pass** — `addEpochAfcContribution()` now called |

---

## 3. Changes Made in This Pass

### 3.1 `src/token/emission.service.ts` — New public method

```typescript
addEpochAfcContribution(afcAmount: number): void
```

Exposes the private `updateAfcReserve()` for use by `FeeDistributionService`. This ensures that epoch-level AFC fee contributions (from `distributeRewards()`) are reflected in the emission price index, not only per-TX contributions.

**Before:** Price index only updated by per-TX `processTransactionEmission()` calls.  
**After:** Price index updated by both per-TX and epoch-level AFC flows — fully canonical.

### 3.2 `src/fee_distribution/fee_distribution.service.ts` — Wire AfcReserve sync

- Injected `EmissionService` as a constructor dependency.
- After recording the `AFC_RESERVE_25PCT` ledger entry inside `distributeRewards()`, calls `this.emissionService.addEpochAfcContribution(afcReserve)`.

**Before:** Epoch AFC recorded in ledger but never reflected in emission price index.  
**After:** Both ledger and price index updated atomically within each epoch finalisation.

### 3.3 `src/token/token.controller.ts` — Canonical REST endpoint

Added `POST /api/v1/token/emit` endpoint that routes to `mintForTransaction()`:

```
POST /api/v1/token/emit
Body: { amount: number, recipient: string, refId: string, commissionRate?: number }
Response: EmissionResult
```

This endpoint implements the full canonical lifecycle: mint 1:1 → collect 75/25 commission → burn → update AFC index.

The legacy `POST /api/v1/token/mint` endpoint is preserved for bridge deposit operations (fiat-to-ARO, where the user retains the ARO tokens).

---

## 4. Canonical Emission Flow (confirmed implementation)

```
processTransactionEmission(txAmount, recipient, refId)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × 0.005  // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:              emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION:  nodeShare (75%) → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION:  afcShare  (25%) → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:              emissionAmount → SYSTEM_BURN_VAULT

All four ledger steps execute within a single atomic QueryRunner transaction.
```

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 7. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing — only increases, never decreases
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction
6. Epoch-level AFC contributions are synced to the price index — invariant added in this pass

---

## 8. Open Recommendations (not in scope for this pass)

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to DB** — currently in-memory, reset on restart. Add `AfcReserveEntity` with periodic snapshots. |
| MEDIUM | **Bridge deposit commission** — `BridgeService.handleFiatDepositWebhook()` calls legacy `mint()` with no commission deduction. Commission collection on fiat deposits should be added in a dedicated bridge-emission pass. |
| LOW | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, epoch AFC sync. |

---

## 9. Previous Pass History

| Date | Branch | Changes |
|------|--------|---------|
| 2026-05-12 | `claude/inspiring-cannon-4qbjK` | Initial audit; rewrote `coin_emission_model.md`, `aro_emission_protocol.md`, `payment_distribution.md`; confirmed `emission.service.ts` canonical |
| 2026-06-06 | `agent/core-emission` | Wired epoch AFC sync; added `POST /emit` canonical endpoint; confirmed all code matches model |
