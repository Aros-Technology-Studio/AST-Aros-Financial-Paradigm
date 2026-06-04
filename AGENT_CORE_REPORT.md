# AGENT-CORE Report — Canonical Emission Audit

**Date:** 2026-06-04  
**Branch:** claude/inspiring-cannon-r9vRx  
**Commit:** feat: canonical 1:1 emission model implementation

---

## 1. Scope Examined

| Location | Files |
|----------|-------|
| `01_coin_engine/` | 11 files (specs, docs, TokenSpec.json) |
| `10_proof_of_transaction_engine/` | 9 files (PoT docs only) |
| `src/token/` | 12 files (emission.service.ts, token.service.ts, tokenomics.service.ts, …) |
| `src/fee_distribution/` | 9 files (service, entities, scheduler) |
| `src/proof_of_transaction_engine/` | 4 files (process_reserve.service.ts, pot.service.ts, …) |

---

## 2. Canonical Model (reference)

```
Emission     = Transaction Amount              (1:1, no multiplier)
Commission   = Transaction Amount × rate       (default 0.5%)
Node Share   = Commission × 0.75              (75% → node pool, by PoT weight)
AFC Reserve  = Commission × 0.25              (25% → SYSTEM_AFC_RESERVE_…)
Burn         = Emission Amount                 (destroyed after TX completes)
Net supply change per TX cycle = 0

AFC Reserve Price Index:
  reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

---

## 3. What Was Already Correct

### `src/token/emission.service.ts` ✅

Fully implements the canonical model:

- `calculate()` — pure function: `emission = txAmount`, `commission = txAmount × rate`, `nodeShare = commission × 0.75`, `afcShare = commission × 0.25`
- `processTransactionEmission()` — full lifecycle: mint (1:1) → fee split (75/25) → AFC reserve update → burn
- `updateAfcReserve()` — correct formula: `1.0 + sqrt(totalReserve) / 10_000`
- Config: `defaultCommissionRate = 0.005`, `nodeShareRatio = 0.75`, `afcReserveRatio = 0.25`

### `src/token/emission.interfaces.ts` ✅

Interfaces `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly model the canonical flow.

### `src/fee_distribution/fee_distribution.service.ts` ✅

Epoch-level distribution uses the canonical 75/25 split:
```typescript
private readonly NODE_SHARE_RATIO = 0.75;
private readonly AFC_SHARE_RATIO  = 0.25;
```
AFC reserve receives `totalFees × 0.25` each epoch.

### `src/token/tokenomics.service.ts` ✅ (deprecated method noted)

`updateInternalValuation()` is correctly marked `@deprecated` and is a no-op. Valuation is driven by `EmissionService`.

### Module 01 status: NOT deprecated

`01_coin_engine/` is documentation-only (no runnable code). It was never deprecated. The canonical code reference it points to is `src/token/emission.service.ts`.

---

## 4. Discrepancies Found and Fixed

### 4.1 `01_coin_engine/AROS_Coin_TokenSpec.json` — Wrong fee split and burn trigger

**Before:**
```json
"distribution": {
  "nodeOperators": 0.75,
  "AST treasury": 0.20,
  "Audit Pool": 0.05
},
...
"burnOn": "governance_rule"
```

**Problem:** 3-way split (0.75 / 0.20 / 0.05) contradicts the canonical 2-way split (0.75 / 0.25).  
`burnOn: "governance_rule"` contradicts the canonical rule (burn on transaction completion).

**After (fixed):**
```json
"distribution": {
  "nodeOperators": 0.75,
  "afcReserve": 0.25
},
...
"burnOn": "transaction_completion"
```

---

### 4.2 `src/token/token.controller.ts` — Canonical emission path unreachable via HTTP

**Before:** Only `POST /api/v1/token/mint` and `POST /api/v1/token/burn` existed, both routing to the legacy `TokenService.mint()` / `TokenService.burn()`. The legacy `mint()` method does NOT perform the canonical emission cycle (no fee split, no burn).

**After (fixed):** Added `POST /api/v1/token/emit` endpoint that calls `TokenService.mintForTransaction()`, which delegates to `EmissionService.processTransactionEmission()` — the full canonical lifecycle.

```
POST /api/v1/token/emit
Body: { transactionAmount, recipient, referenceId, commissionRate? }
Returns: EmissionResult { emissionAmount, commission, nodeShare, afcReserveShare, commissionRate }
```

---

## 5. Legacy vs. Canonical Paths

| Path | Method | Canonical? | Notes |
|------|--------|------------|-------|
| `POST /api/v1/token/emit` | `mintForTransaction()` → `EmissionService` | ✅ YES | Use for all real transactions |
| `POST /api/v1/token/mint` | legacy `TokenService.mint()` | ❌ NO | FIAT deposit only; no fee split, no burn |
| `POST /api/v1/token/burn` | legacy `TokenService.burn()` | ❌ NO | FIAT withdrawal / redemption only |

The legacy mint/burn endpoints are intentionally kept for the FIAT bridge (deposit/withdrawal flows). They do not represent the canonical emission cycle and should not be used for transaction-triggered emission.

---

## 6. File Change Summary

| File | Change |
|------|--------|
| `01_coin_engine/AROS_Coin_TokenSpec.json` | Fixed fee split (0.75/0.20/0.05 → 0.75/0.25), fixed burnOn ("governance_rule" → "transaction_completion") |
| `src/token/token.controller.ts` | Added `POST /emit` canonical endpoint calling `mintForTransaction()` |
| `AGENT_CORE_REPORT.md` | This file — audit findings |

---

## 7. Confirmed System Addresses

| Address | Role |
|---------|------|
| `SYSTEM_EMISSION_AUTHORITY_00000000000` | Mints ARO 1:1 to recipient |
| `SYSTEM_NODE_POOL_00000000000000000000` | Receives 75% of commission |
| `SYSTEM_AFC_RESERVE_000000000000000000` | Receives 25% of commission, drives price index |
| `SYSTEM_BURN_VAULT_00000000000000000000` | Burns emitted ARO after TX completes |

---

## 8. Conclusion

The canonical 1:1 emission model is **correctly implemented** in `src/token/emission.service.ts`. Two spec-level discrepancies were corrected (TokenSpec.json fee split and burnOn rule), and the canonical emission cycle is now reachable via HTTP (`POST /api/v1/token/emit`). No logic rewrites were required in the emission engine itself.
