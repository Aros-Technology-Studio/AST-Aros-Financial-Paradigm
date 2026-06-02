# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-znY6f` (feature branch: `agent/core-emission`)  
**Date:** 2026-06-02  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Pre-audit state | Action |
|------|----------------|--------|
| `coin_emission_model.md` | Canonical 1:1 formulas present | ✅ Confirmed correct |
| `aro_emission_protocol.md` | Canonical formulas + Mermaid flow diagram | ✅ Confirmed correct |
| `payment_distribution.md` | Canonical 75/25 split documented | ✅ Confirmed correct |
| `burn_and_mint_rules.md` | Correct burn-on-completion policy | ✅ Confirmed correct |
| `README.md` | Architecture overview; no formula conflicts | ✅ Confirmed correct |

**Module 01 is NOT deprecated.** It is pure specification documentation. The canonical source-of-truth code lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: DIVERGENCE FOUND AND FIXED

| File | Pre-audit state | Action |
|------|----------------|--------|
| `pot_tx_incentive_distribution.md` | **60% validators / 30% attesters / 10% burn** — DIVERGES from canonical 75/25 | **Rewritten** to canonical 75/25 with PoT weight formula |
| `pot_engine_overview.md` | Architecture overview; no emission formulas | ✅ No changes needed |
| `pot_tx_validation_logic.md` | Validation pipeline spec; no emission formulas | ✅ No changes needed |
| `pot_tx_signature_model.md` | Signature spec; no emission formulas | ✅ No changes needed |
| `pot_slashing_conditions.md` | Slashing spec; no emission formulas | ✅ No changes needed |
| `pot_challenge_response.md` | Challenge spec; no emission formulas | ✅ No changes needed |

### src/token/ — Status: Canonical code confirmed + gaps filled

| File | State | Action |
|------|-------|--------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` | No changes |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle | No changes |
| `emission.service.spec.ts` | **Missing** — no tests existed | **Created** — 12 unit tests |
| `token.service.ts` | ✅ `mintForTransaction()` → `EmissionService`; legacy `mint()` preserved for FIAT_DEPOSIT | No changes |
| `token.controller.ts` | **Missing `POST /emit` and `GET /emission/state` endpoints** | **Added** |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` → `processReserve.reserveIndex`; `updateInternalValuation()` deprecated no-op | No changes |
| `token.module.ts` | ✅ `EmissionService` registered and exported | No changes |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` — `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| All 4 steps atomic | Yes | ✅ Single `QueryRunner` transaction; rolls back on any failure |
| PoT incentive distribution 75/25 | Yes | ✅ Fixed in `pot_tx_incentive_distribution.md` |

---

## 3. Divergences Found and Fixed

### 3.1 `pot_tx_incentive_distribution.md` — Wrong distribution split

**Before:**
```
Allocate: 60% validators, 30% attesters, 10% burn.
```

**After (canonical):**
```
commission    = transactionAmount × rate       (default 0.5%)
node_pool     = commission × 0.75              (→ SYSTEM_NODE_POOL)
afc_reserve   = commission × 0.25              (→ SYSTEM_AFC_RESERVE)
node_incentive = node_pool × (node_weight / Σ node_weights)
```

The old 60/30/10 model had three separate actor categories and a burn that is not part of the per-TX commission flow. The canonical model burns the *emission* (not the fee) after transaction completion, while fees flow 75/25 with no separate attester cut.

### 3.2 `token.controller.ts` — No canonical emission HTTP endpoint

**Before:** Only `POST /api/v1/token/mint` (legacy FIAT_DEPOSIT path, bypasses `EmissionService`).

**After:** Added:
- `POST /api/v1/token/emit` → `TokenService.mintForTransaction()` → full canonical lifecycle
- `GET /api/v1/token/emission/state` → returns live `AfcReserveState` + current emission price

### 3.3 `emission.service.spec.ts` — Missing unit tests

**Created** `src/token/emission.service.spec.ts` with 12 unit tests covering:
- `calculate()`: 1:1 emission, default 0.5% commission, 75/25 split, custom rate, zero/negative guards, dust amounts
- `processTransactionEmission()`: correct 4 ledger entries (MINT + 2×FEE_DIST + BURN), burn equals mint, rollback on failure
- AFC reserve: starts at 1.0, monotonically rises, snapshot immutability
- `updateCommissionRate()`: valid range enforcement

---

## 4. Implementation Summary

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
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per validator)
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
2. `nodeShare + afcShare == commission` (no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Sync epoch AFC to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; sync the in-memory index after each epoch finalization.
- **Rate governance integration** — expose `updateCommissionRate()` via a governance-only endpoint (with role guard).
