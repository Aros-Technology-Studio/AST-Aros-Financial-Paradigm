# AGENT-CORE EMISSION AUDIT REPORT

**Date:** 2026-06-11  
**Branch:** `claude/inspiring-cannon-po0o83`  
**Scope:** Canonical 1:1 ArosCoin emission model audit

---

## 1. Directory Scan

| Path | Status | Role |
|------|--------|------|
| `01_coin_engine/` | **DEPRECATED** (docs + architecture) | Reference spec only — superseded by Module 08 |
| `08_fee_distribution/` | Active (docs) | Canonical fee distribution documentation |
| `10_proof_of_transaction_engine/` | Active (docs) | PoT consensus documentation |
| `src/token/` | **ACTIVE** | Canonical implementation |
| `src/fee_distribution/` | **ACTIVE** | Epoch-based fee distribution engine |
| `src/proof_of_transaction_engine/` | **ACTIVE** | PoT weight + reserve index |

**Module 01 Deprecated:** Confirmed in `docs/architecture/Module_Map.md:9`, `Architecture_Overview.md:12`, and `README.md:31`.  
**Logic moved to:** `src/token/emission.service.ts` (canonical engine) + `src/fee_distribution/fee_distribution.service.ts` (epoch distribution).

---

## 2. Canonical Model vs. Code: Compliance Check

### Canonical Formula
```
Emission     = Transaction Amount           (1:1)
Commission   = Transaction Amount × rate    (default 0.5%)
Node Share   = Commission × 0.75            (75% → nodes)
AFC Reserve  = Commission × 0.25            (25% → reserve)
ARO          = burned after TX completes    (net circulating Δ = 0)
AFC reserve grows → reserveIndex rises → next emission costs more
```

### `src/token/emission.service.ts` — FULLY COMPLIANT

```typescript
// calculate() — pure, no side effects
const emission   = transactionAmount;              // 1:1
const commission = transactionAmount * rate;       // 0.5% default
const nodeShare  = commission * 0.75;              // 75%
const afcShare   = commission * 0.25;              // 25%

// processTransactionEmission() lifecycle:
// Step 1 — Mint ARO 1:1 to recipient
// Step 2a — Record 75% to NODE_POOL_ADDRESS
// Step 2b — Record 25% to AFC_RESERVE_ADDRESS
// Step 3 — updateAfcReserve() → reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
// Step 4 — Burn emitted ARO (POST_TX_CANONICAL_BURN)
// Step 5 — SupplySnapshot: totalMinted++, totalBurned++, circulatingSupply unchanged
```

### `src/token/emission.interfaces.ts` — COMPLIANT

All fields correctly typed: `emissionAmount = transactionAmount`, `nodeShare`, `afcReserveShare`.

### `src/fee_distribution/fee_distribution.service.ts` — COMPLIANT

```typescript
NODE_SHARE_RATIO = 0.75  // 75%
AFC_SHARE_RATIO  = 0.25  // 25%
```

Epoch finalization: collects fees, splits 75/25, distributes to nodes by PoT weight, records AFC contribution.

### `src/token/token.service.ts` — MIXED

| Method | Status | Notes |
|--------|--------|-------|
| `mintForTransaction()` | CORRECT | Delegates to `emissionService.processTransactionEmission()` |
| `mint()` | LEGACY | FIAT_DEPOSIT only — no fee split, no burn, permanent supply increase |
| `burn()` | CORRECT (purpose) | FIAT_WITHDRAWAL — reduces supply when ARO redeemed for fiat |

### `src/token/token.controller.ts` — GAP (pre-fix)

| Endpoint | Pre-fix | Post-fix |
|----------|---------|----------|
| `POST /api/v1/token/emit` | MISSING | Added — routes to `mintForTransaction()` |
| `POST /api/v1/token/mint` | Routes to legacy `mint()` | Retained (deprecated), FIAT_DEPOSIT only |

---

## 3. Findings

### Finding 1 — Module 01 Deprecated: Logic Correctly Migrated

Module 01 (`01_coin_engine/`) is documentation-only and explicitly deprecated in three architecture files. All emission logic has been correctly migrated to `src/token/emission.service.ts`. The canonical formulas from Module 01 (1:1 ratio, 75/25 split, burn mechanic) are faithfully implemented.

### Finding 2 — Core Emission Engine: Correct

`EmissionService.calculate()` and `EmissionService.processTransactionEmission()` implement the canonical model exactly. The transaction lifecycle (mint → fee split → AFC reserve update → burn → supply snapshot) is correct and atomic (wrapped in a database transaction with rollback on error).

### Finding 3 — Missing Canonical HTTP Endpoint (FIXED)

`mintForTransaction()` existed in `TokenService` but was never exposed via an HTTP endpoint. The only public `/mint` route called the legacy `mint()` function which bypasses canonical emission (no commission, no burn, permanent supply increase).

**Fix applied:** Added `POST /api/v1/token/emit` in `token.controller.ts` routing to `mintForTransaction()`. Legacy `/mint` retained with `@deprecated` annotation for FIAT_DEPOSIT backward compatibility.

### Finding 4 — Legacy mint() Scope Clarification

The `mint()` function serves a different use case (FIAT_DEPOSIT: external fiat → user's ARO wallet). It is NOT a payment transaction emission. It is now explicitly marked `@deprecated` with a note directing payment transactions to `mintForTransaction()`. The `burn()` function (FIAT_WITHDRAWAL) is correct as-is.

---

## 4. Files Modified

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /emit` canonical endpoint; added `@deprecated` JSDoc on `/mint`; removed stale inline comments |
| `src/token/token.service.ts` | Added `@deprecated` JSDoc to `mint()` method |

---

## 5. Files Confirmed Correct (No Changes Needed)

- `src/token/emission.service.ts` — canonical 1:1 engine, fully correct
- `src/token/emission.interfaces.ts` — correct type definitions
- `src/fee_distribution/fee_distribution.service.ts` — correct 75/25 split
- `src/token/tokenomics.service.ts` — `updateInternalValuation()` already deprecated; price derived from AFC reserve index

---

## 6. Canonical Emission API (Post-Fix)

### `POST /api/v1/token/emit` — Canonical Payment Transaction Emission

```json
// Request
{
  "transactionAmount": 10000,
  "recipient": "wallet_address_here",
  "referenceId": "TX-REF-001",
  "commissionRate": 0.005
}

// Response (EmissionResult)
{
  "transactionAmount": 10000,
  "emissionAmount": 10000,
  "commission": 50,
  "nodeShare": 37.5,
  "afcReserveShare": 12.5,
  "commissionRate": 0.005
}
```

**Lifecycle for $10,000 transaction:**
1. Mint 10,000 ARO to recipient (1:1)
2. Record 37.5 ARO (75% of 50) → NODE_POOL
3. Record 12.5 ARO (25% of 50) → AFC_RESERVE
4. AFC reserve index updated: `1.0 + sqrt(totalReserve) / 10_000` (price rises)
5. Burn 10,000 ARO — net circulating supply Δ = 0

---

## 7. Conclusion

The canonical 1:1 emission model is **correctly implemented** in `src/token/emission.service.ts`. Module 01 has been properly superseded by Module 08 and `src/token/`. The only gap was a missing HTTP endpoint for canonical emission — fixed with `POST /api/v1/token/emit`. All core formulas, fee splits, burn mechanics, and AFC reserve dynamics comply with the canonical specification.
