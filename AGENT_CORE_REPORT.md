# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-BE15j`  
**Date:** 2026-06-06  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Content | Action |
|------|---------|--------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index, example | Verified ✅ |
| `aro_emission_protocol.md` | Canonical 1:1 + 75/25 split + burn lifecycle | Verified ✅ |
| `payment_distribution.md` | 75/25 canonical split with validator weight formula | Verified ✅ |
| `burn_and_mint_rules.md` | Burn-on-completion policy; consistent with canonical model | Verified ✅ |

**Module 01 is NOT deprecated** — it is pure specification. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical state after this session

| File | Status | Notes |
|------|--------|-------|
| `emission.interfaces.ts` | ✅ No change | `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Updated | Added public `contributeToAfcReserve()` wrapper |
| `token.service.ts` | ✅ Fixed | `mint()` now applies canonical 75/25 commission split; deprecated calls removed |
| `tokenomics.service.ts` | ✅ No change | `updateInternalValuation()` deprecated no-op retained for backward-compat; not called by `TokenService` anymore |
| `token.module.ts` | ✅ No change | All providers/exports intact |

---

## 2. Canonical Model Verification

| Rule | Canonical | `EmissionService` | Bridge `mint()` before | Bridge `mint()` after |
|------|-----------|------------------|----------------------|----------------------|
| Emission = TX Amount (1:1) | `emission = amount` | ✅ | ✅ mints 1:1 | ✅ mints 1:1 |
| Commission = amount × 0.5% | Yes | ✅ | ❌ no commission | ✅ `emissionService.calculate()` |
| 75% commission → nodes | Yes | ✅ | ❌ missing | ✅ `FEE_DISTRIBUTION NODE_POOL` |
| 25% commission → AFC reserve | Yes | ✅ | ❌ missing | ✅ `FEE_DISTRIBUTION AFC_RESERVE` |
| AFC reserve index updates | Yes | ✅ | ❌ no-op (deprecated call) | ✅ `contributeToAfcReserve()` |
| ARO burn after TX | Yes (for payment TXs) | ✅ | N/A (FIAT_DEPOSIT, user holds tokens) | N/A (intentionally not burned) |
| Deprecated `updateInternalValuation()` | Removed | — | ❌ called in `mint()` + `burn()` | ✅ removed from both |

---

## 3. Changes Made in This Session

### `src/token/emission.service.ts`

Added public method after `getCurrentEmissionPrice()`:

```typescript
contributeToAfcReserve(amount: number): void {
    this.updateAfcReserve(amount);
}
```

Exposes the private `updateAfcReserve()` to external callers (bridge mint path) without duplicating logic.

---

### `src/token/token.service.ts`

**`mint()` — before (legacy, non-canonical):**
- Minted 1:1 with no commission
- Called deprecated no-op `tokenomicsService.updateInternalValuation()`
- Did not update AFC reserve index

**`mint()` — after (canonical commission split):**
```
1. MINT       emissionAmount → recipient             (1:1)
2. FEE_DIST   nodeShare (75%)  → SYSTEM_NODE_POOL
3. FEE_DIST   afcShare  (25%)  → SYSTEM_AFC_RESERVE
4. updateAfcReserve(afcShare)  → reserveIndex rises
5. On-chain record + supply snapshot
```

Note: FIAT_DEPOSIT `mint()` intentionally does NOT burn the emitted ARO — the user is acquiring tokens to hold. Only the canonical `processTransactionEmission()` path (payment transactions) burns post-completion.

**`burn()` — change:**
- Removed deprecated `tokenomicsService.updateInternalValuation()` call
- Price in response now sourced from `emissionService.getCurrentEmissionPrice()` (was from deprecated tokenomics path)

**Import cleanup:**
- Removed `TokenomicsService` import and constructor injection from `TokenService` (no longer needed)

---

## 4. Implementation Detail

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

All four ledger steps execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 5. Example: $10,000 Transaction (canonical)

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

## Example: $10,000 FIAT_DEPOSIT via bridge

```
Fiat In        = $10,000
Emission       = 10,000 ARO  (1:1 mint → recipient wallet)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  → FEE_DISTRIBUTION
  AFC reserve  = 50 × 0.25  = 12.50 ARO  → FEE_DISTRIBUTION
  reserveIndex rises by sqrt(12.50) / 10_000
No burn        — user retains 10,000 ARO as held balance
Net circulating change = +10,000 ARO (user's wallet)
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All ledger steps in `processTransactionEmission()` succeed or all roll back (atomic `QueryRunner`)

---

## 7. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; resets on service restart. Add an `AfcReserveEntity` table with epoch-level snapshots and a load-on-startup step.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and `contributeToAfcReserve()`.
- **Sync `FeeDistributionService` AFC contribution to `EmissionService`** — epoch-level `distributeRewards()` credits `SYSTEM_AFC_RESERVE` on the ledger but does not call `contributeToAfcReserve()`; the in-memory index diverges from on-chain reality over time.
