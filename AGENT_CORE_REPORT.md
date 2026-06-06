# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-06  
**Task:** Full audit of ArosCoin emission logic against the canonical model and alignment of all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only, NOT deprecated

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 model correctly documented |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid flow diagram |
| `payment_distribution.md` | ✅ 75/25 split with historical note re: superseded 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy aligned |
| `README.md` | ✅ Architecture overview, no conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation. All canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, weighting, and incentive distribution. Actual PoT code lives in `src/proof_of_transaction_engine/`. **No emission logic here.**

### src/token/ — Status: Canonical code confirmed correct

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `recordAfcContribution()` wires epoch AFC sync |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge deposits |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ✅ `POST /api/v1/token/emit` + `GET /api/v1/token/emission/price` canonical endpoints |

### src/fee_distribution/ — Status: Correct

| File | Status |
|------|--------|
| `fee_distribution.service.ts` | ✅ `EmissionService` injected; `recordAfcContribution()` called after epoch AFC recording |

### src/proof_of_transaction_engine/ — Status: Unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Volume ledger; `reserveIndex` via `log1p`; used by deprecated `tokenomics.service.ts` path |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `burnAmount` (= emission − commission) in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC synced to price index | Yes | ✅ `recordAfcContribution()` called by `FeeDistributionService` after each epoch |
| HTTP endpoint for canonical flow | Yes | ✅ `POST /api/v1/token/emit` + `GET /api/v1/token/emission/price` |

---

## 3. Changes Made Across Sessions

### `src/token/emission.service.ts`

Key refinements compared to the initial implementation:

- **`burnAmount = emissionAmount − commission`** — Burning the full `emissionAmount` when the recipient has already paid commission would create a ledger deficit. Correct burn = what remains after commission is paid.
- **`updateAfcReserve` called after `commitTransaction()`** — If called before commit and the commit fails, the in-memory index would drift permanently from the on-chain records. Moving it post-commit prevents the desync.
- **`recordAfcContribution(amount)`** — Public method for epoch-level AFC sync. `FeeDistributionService` calls this after each epoch finalization so that epoch fees also drive the price index.

### `src/fee_distribution/fee_distribution.service.ts`

- `EmissionService` injected as a constructor dependency (available via already-imported `TokenModule`).
- Calls `this.emissionService.recordAfcContribution(afcReserve)` after recording the `AFC_RESERVE_25PCT` ledger entry.

**Before:** Epoch AFC recorded in ledger but emission price index never reflected it.  
**After:** Both ledger and price index updated within each epoch finalization.

### `src/token/token.controller.ts`

- `POST /api/v1/token/emit` — canonical emission lifecycle (mintForTransaction).
- `GET /api/v1/token/emission/price` — returns current `reserveIndex` and full `AfcReserveState`.
- `EmissionService` injected directly into controller for price reads.
- Legacy `POST /api/v1/token/mint` deprecated with inline comment; preserved for FIAT_DEPOSIT custody flow.

---

## 4. Canonical Emission Flow (full implementation)

```
POST /api/v1/token/emit  →  TokenService.mintForTransaction()
  →  EmissionService.processTransactionEmission(txAmount, recipient, refId)
        │
        ├─ calculate():
        │    emissionAmount = txAmount          // 1:1
        │    commission     = txAmount × 0.005  // 0.5% default
        │    nodeShare      = commission × 0.75
        │    afcShare       = commission × 0.25
        │    burnAmount     = emissionAmount − commission
        │
        ├─ Ledger MINT:              emissionAmount → recipient
        ├─ Ledger FEE_DISTRIBUTION:  nodeShare (75%) → SYSTEM_NODE_POOL
        ├─ Ledger FEE_DISTRIBUTION:  afcShare  (25%) → SYSTEM_AFC_RESERVE
        ├─ Ledger BURN:              burnAmount → SYSTEM_BURN_VAULT
        ├─ commitTransaction()       ← all four ops atomic
        └─ updateAfcReserve(afcShare) ← AFTER commit (prevents in-memory desync)
             reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
```

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 − 50 = 9,950 ARO  (recipient burns what remains)
Net circulating supply change = +50 ARO   (commission stays in circulation)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `burnAmount = emissionAmount − commission` (recipient burns what remains after commission)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. `updateAfcReserve()` is called only after successful `commitTransaction()`

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add a `AfcReserveEntity` table restored on boot from the last snapshot.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, `burnAmount` correctness, and `recordAfcContribution()`.
