# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-19  
**Task:** Audit ArosCoin emission logic against the canonical model; fix all divergences

---

## 1. Canonical Model (Reference)

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × rate    (default rate = 0.5%)
Node Share   = Commission × 0.75            (75% → processing nodes by PoT weight)
AFC Reserve  = Commission × 0.25            (25% → AFC reserve contract)
Burn         = Emission Amount              (ARO destroyed after TX completes)

Net circulating supply change per canonical TX cycle = 0

AFC Reserve Index = 1.0 + sqrt(totalAfcReserve) / 10_000
  (price of next emission rises monotonically as reserve accumulates)
```

---

## 2. Scope of Audit

| Location | Type | Examined |
|----------|------|----------|
| `01_coin_engine/` | Documentation | ✅ All `.md` files |
| `10_proof_of_transaction_engine/` | Documentation | ✅ All `.md` files |
| `src/token/` | Source code | ✅ All `.ts` files |
| `src/fee_distribution/` | Source code | ✅ `fee_distribution.service.ts` |
| `src/proof_of_transaction_engine/` | Source code | ✅ `pot.service.ts`, `process_reserve.service.ts` |

---

## 3. Module Status

### 3.1 `01_coin_engine/` — Documentation only (NOT deprecated)

All source code lives in `src/token/`. This module contains specification documents only.

| File | Content | Status |
|------|---------|--------|
| `coin_emission_model.md` | Canonical formula, AFC reserve index, worked example | ✅ Correct |
| `aro_emission_protocol.md` | Mermaid flow, canonical formula, governance table | ✅ Correct |
| `payment_distribution.md` | 75/25 split, validator weight formula | ✅ Correct |
| `burn_and_mint_rules.md` | Burn-on-completion policy | ✅ Non-contradictory |
| `README.md` | Architecture overview | ✅ Correct |

**Module 01 is NOT deprecated.** Canonical implementation lives in `src/token/emission.service.ts`.

### 3.2 `10_proof_of_transaction_engine/` — Documentation only

Contains PoT validation, slashing, signature model, and incentive distribution specs.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### 3.3 `src/token/` — Issues found and fixed (see Section 4)

| File | Pre-fix state | Action |
|------|--------------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correct | None |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented | None |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` kept | None |
| `token.module.ts` | ✅ `EmissionService` registered and exported | None |
| `tokenomics.service.ts` | ❌ `getCurrentPrice()` used `log1p` (processReserve), not canonical `sqrt` | **Fixed** |
| `token.controller.ts` | ❌ `POST /mint` called legacy `mint()` — no fee split, no burn | **Fixed** |

### 3.4 `src/fee_distribution/fee_distribution.service.ts`

`distributeRewards()` correctly applies the canonical 75/25 split at epoch finalization:

```typescript
const nodePool   = totalFees * 0.75;   // → nodes weighted by PoT score
const afcReserve = totalFees * 0.25;   // → SYSTEM_AFC_RESERVE
```

✅ Correct. No changes required.

### 3.5 `src/proof_of_transaction_engine/pot.service.ts`

Implements `S_i = α·|TX_i| + β·F_i − δ·P_i` scoring and normalized weight calculation.  
Used by `FeeDistributionService` to distribute node pool share. No emission logic here.  
✅ Correct. No changes required.

---

## 4. Issues Found and Fixed

### Issue 1 — `TokenController.mintTokens()` bypassed canonical emission (FIXED)

**File:** `src/token/token.controller.ts` — `POST /api/v1/token/mint`

**Pre-fix:** `tokenService.mint(amount, recipient, refId)`  
The legacy `mint()` records a raw MINT ledger entry with no commission split and no post-TX burn.  
Net effect: permanent ARO creation — circulating supply grows permanently per call.  
**This violates the canonical model** (no 75/25 split, no burn, net supply change ≠ 0).

**Fix applied:**

```typescript
// Before (legacy — bypasses canonical model):
return await this.tokenService.mint(body.amount, body.recipient, body.refId);

// After (canonical — full 1:1 emission lifecycle):
const result = await this.tokenService.mintForTransaction(
    parseFloat(body.amount),
    body.recipient,
    body.refId,
);
// Returns: emissionAmount, commission, nodeShare, afcReserveShare, commissionRate
```

`EmissionService` is now injected into `TokenController`.  
`GET /api/v1/token/emission/state` endpoint added — exposes live AFC reserve state and current price index.

---

### Issue 2 — `TokenomicsService.getCurrentPrice()` used non-canonical price formula (FIXED)

**File:** `src/token/tokenomics.service.ts`

**Pre-fix:** delegated to `processReserve.getReserveState().reserveIndex`  
`ProcessReserveLedgerService` computes its index via `log1p` (logarithmic growth).  
The canonical formula is `1.0 + sqrt(totalAfcReserve) / 10_000` (square-root growth).  
These produce different values and diverge as reserve scale increases — **non-canonical**.

**Fix applied:**

```typescript
// Before (non-canonical log1p formula):
getCurrentPrice(): number {
    const state = this.processReserve.getReserveState();
    return state.reserveIndex;
}

// After (canonical sqrt formula via EmissionService):
getCurrentPrice(): number {
    return this.emissionService.getCurrentEmissionPrice();
}
```

`ProcessReserveLedgerService` dependency removed from `TokenomicsService`.  
`EmissionService` injected via `@Inject(forwardRef(() => EmissionService))`.

---

## 5. Post-Fix Verification

| Rule | Canonical | Implementation | Result |
|------|-----------|----------------|--------|
| Emission = TX Amount | 1:1 | `emission = transactionAmount` in `EmissionService.calculate()` | ✅ |
| Fee = TX Amount × rate | default 0.5% | `commission = transactionAmount * 0.005` | ✅ |
| Fee split nodes | 75% | `nodeShare = commission * 0.75` | ✅ |
| Fee split AFC reserve | 25% | `afcShare = commission * 0.25` | ✅ |
| ARO burn after TX | Yes | Atomic `BURN` ledger record for `emissionAmount` | ✅ |
| AFC reserve → price rises | Yes | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | ✅ |
| Net circulating supply change | Zero | `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` | ✅ |
| Controller calls canonical path | Yes | `POST /mint` → `mintForTransaction()` → `EmissionService` | ✅ |
| `TokenomicsService` price source | EmissionService | `getCurrentPrice()` → `getCurrentEmissionPrice()` | ✅ |
| Epoch fees also 75/25 | Yes | `FeeDistributionService.distributeRewards()` | ✅ |
| Atomicity | Yes | All 4 ledger steps in single `QueryRunner` transaction | ✅ |

---

## 6. Canonical Emission Lifecycle

```
POST /api/v1/token/mint → TokenController.mintTokens()
  → TokenService.mintForTransaction(txAmount, recipient, refId)
    → EmissionService.processTransactionEmission(txAmount, recipient, refId, rate?)
        │
        ├─ calculate():
        │    emissionAmount = txAmount          // 1:1
        │    commission     = txAmount × rate   // default 0.5%
        │    nodeShare      = commission × 0.75
        │    afcShare       = commission × 0.25
        │
        ├─ Ledger MINT:             emissionAmount → recipient
        ├─ Ledger FEE_DISTRIBUTION: nodeShare (75%) → SYSTEM_NODE_POOL
        ├─ Ledger FEE_DISTRIBUTION: afcShare  (25%) → SYSTEM_AFC_RESERVE
        ├─ updateAfcReserve(afcShare):
        │    totalReserve  += afcShare
        │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
        └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
             → all four steps atomic (single QueryRunner transaction)
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 7. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per active node)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000353
  → every subsequent emission is priced slightly higher
```

---

## 8. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on zero/negative.
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision.
3. `totalMinted == totalBurned` per canonical TX cycle — verified in `EmissionService.updateSupplySnapshot()`.
4. `reserveIndex` is monotonically non-decreasing — formula `1.0 + sqrt(...)` only grows.
5. Atomicity — all four ledger steps succeed or all roll back via `QueryRunner` transaction.

---

## 9. Remaining Recommendations

| Priority | Item | Description |
|----------|------|-------------|
| HIGH | Persist `AfcReserveState` | Currently in-memory; lost on service restart. Add `AfcReserveEntity` DB table. |
| MEDIUM | Sync epoch AFC to `EmissionService` | `FeeDistributionService` writes AFC to ledger but does not call `EmissionService.updateAfcReserve()`; in-memory `reserveIndex` lags after epoch finalization. |
| LOW | Unit tests for `EmissionService.calculate()` | Cover dust amounts, max commission rate, zero-amount guard, split precision. |
| LOW | Commission rate bounds | Governance should enforce a tighter operational bound (e.g. 0.1%–2%) beyond the current 0–1 range. |

---

## 10. Files Changed in This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Fixed `POST /mint` → `mintForTransaction()`; injected `EmissionService`; added `GET /emission/state` |
| `src/token/tokenomics.service.ts` | Fixed `getCurrentPrice()` to delegate to `EmissionService.getCurrentEmissionPrice()`; replaced `ProcessReserveLedgerService` dependency |
| `AGENT_CORE_REPORT.md` | This document |
