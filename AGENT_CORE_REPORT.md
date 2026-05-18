# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-18  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Canonical Model Reference

| Rule | Specification |
|------|--------------|
| Emission = TX Amount | 1:1 — no multipliers |
| Fee = TX Amount × rate | default 0.5% |
| Fee split — nodes | 75% of fee → SYSTEM_NODE_POOL |
| Fee split — AFC reserve | 25% of fee → SYSTEM_AFC_RESERVE |
| ARO lifecycle | Minted at TX start, burned at TX completion (transient) |
| Reserve price index | `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` |
| Net circulating supply change | 0 per canonical TX cycle |

---

## 2. Directory Audit

### 01_coin_engine — Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Sequencediagram + formulas match canonical model exactly |
| `payment_distribution.md` | ✅ 75/25 split documented |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy present |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source-of-truth code is in `src/token/`.

### 10_proof_of_transaction_engine — Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Primary audit target

| File | Pre-patch state | Action |
|------|----------------|--------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` | None required |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented | None required |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved | None required |
| `tokenomics.service.ts` | ❌ `getCurrentPrice()` delegated to `processReserve` (log1p), not canonical sqrt | **Fixed** — now delegates to `EmissionService.getCurrentEmissionPrice()` |
| `token.controller.ts` | ❌ `POST /api/v1/token/mint` called legacy `mint()` — no fee split, no burn | **Fixed** — now calls `mintForTransaction()`; adds `GET /emission/state` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported | None required |

### src/fee_distribution/ — Canonical, no changes needed

`FeeDistributionService.distributeRewards()` applies the canonical 75/25 epoch-level split.  
`NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` — confirmed correct.

### src/proof_of_transaction_engine/

| File | State |
|------|-------|
| `process_reserve.service.ts` | General volume ledger with log1p index; used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 3. Issues Found and Fixed

### Issue 1 — `TokenController.mintTokens()` called legacy `mint()` (FIXED)

**Location:** `src/token/token.controller.ts` — `POST /api/v1/token/mint`

**Pre-patch:** `tokenService.mint(amount, recipient, refId)`  
The legacy `mint()` issues a raw MINT ledger record with no commission split and no burn.  
Net effect: permanent ARO creation without the canonical 75/25 fee routing or post-TX burn.

**Post-patch:** `tokenService.mintForTransaction(parseFloat(amount), recipient, refId, commissionRate?)`  
Routes through `EmissionService.processTransactionEmission()` — full canonical lifecycle:
1. MINT `emissionAmount` → recipient (1:1)
2. FEE_DISTRIBUTION `nodeShare (75%)` → SYSTEM_NODE_POOL
3. FEE_DISTRIBUTION `afcShare (25%)` → SYSTEM_AFC_RESERVE
4. `updateAfcReserve(afcShare)` — reserveIndex rises
5. BURN `emissionAmount` → SYSTEM_BURN_VAULT

All five steps execute atomically within a single `QueryRunner` transaction.

Additionally, `GET /api/v1/token/emission/state` was added to expose live AFC reserve state and current emission price index.

---

### Issue 2 — `TokenomicsService.getCurrentPrice()` did not use canonical sqrt formula (FIXED)

**Location:** `src/token/tokenomics.service.ts`

**Pre-patch:** delegated to `processReserve.getReserveState().reserveIndex` — uses a `log1p` formula, diverging from canonical `1.0 + sqrt(totalAfcReserve) / 10_000`.

**Post-patch:** delegates to `emissionService.getCurrentEmissionPrice()` — now returns the canonical sqrt-based price index from `EmissionService`.

---

## 4. Canonical Model Verification — Post-Fix

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ BURN ledger record for `emissionAmount` in same atomic TX |
| AFC reserve → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Controller endpoint canonical | Yes | ✅ `POST /mint` → `mintForTransaction()` |
| Price index source of truth | EmissionService | ✅ `tokenomics.getCurrentPrice()` → `EmissionService.getCurrentEmissionPrice()` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

---

## 5. Emission Lifecycle — Implementation Detail

```
POST /api/v1/token/mint  →  TokenController.mintTokens()
  │
  └─ TokenService.mintForTransaction(txAmount, recipient, refId, rate?)
       │
       └─ EmissionService.processTransactionEmission(txAmount, recipient, refId, rate?)
            │
            ├─ calculate():
            │    emissionAmount = txAmount          // 1:1
            │    commission     = txAmount × 0.005  // 0.5% default
            │    nodeShare      = commission × 0.75
            │    afcShare       = commission × 0.25
            │
            ├─ Ledger MINT:             emissionAmount → recipient
            ├─ Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL
            ├─ Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE
            ├─ updateAfcReserve(afcShare):
            │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
            └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

---

## 6. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 7. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 8. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 9. Remaining Recommendations (non-blocking)

- **Persist `AfcReserveState` to DB** — currently in-memory; lost on service restart. Add `AfcReserveEntity` table.
- **Sync epoch AFC contribution** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; consider calling it after each epoch finalization to keep the in-memory index accurate.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Deprecate `TokenService.mint()`** — now that the controller uses the canonical path, mark `mint()` as `@deprecated` and plan removal.
