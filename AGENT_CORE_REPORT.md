# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-xGpxR`  
**Date:** 2026-05-16  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, example |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid flow, 75/25 split, kill-switch |
| `payment_distribution.md` | ✅ Canonical | 75/25 table, PoT weight formula |
| `burn_and_mint_rules.md` | ✅ Compatible | General burn policy; no conflicts |
| `README.md` | ✅ Compatible | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure specification. The canonical implementation lives in `src/token/`.

### 10_proof_of_transaction_engine — Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Implementation: `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical implementation

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle |
| `token.service.ts` | ✅ `mintForTransaction()` is canonical entry point; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ **FIXED** — `getCurrentPrice()` now delegates to `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Canonical

`FeeDistributionService.distributeRewards()` applies 75/25 split per epoch: 75% to node pool, 25% to `SYSTEM_AFC_RESERVE_000000000000000000`.

### src/proof_of_transaction_engine/ — Unchanged

`process_reserve.service.ts` — general process volume ledger; used by legacy tokenomics path only.  
`pot.service.ts` — PoT scoring and weight normalization; correct and untouched.

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Price query returns canonical index | Yes | ✅ **FIXED** `TokenomicsService.getCurrentPrice()` → `EmissionService` |

---

## 3. Fix Applied This Run

### Divergence found: `TokenomicsService.getCurrentPrice()` used wrong index

**Before:**
```typescript
getCurrentPrice(): number {
    const state = this.processReserve.getReserveState();
    return state.reserveIndex; // log1p-based, not canonical
}
```

`ProcessReserveLedgerService.reserveIndex` uses `1.0 + log1p(totalProcessVolume) / 100` — a different formula tracking total process volume, not the AFC reserve.

**After:**
```typescript
getCurrentPrice(): number {
    return this.emissionService.getCurrentEmissionPrice();
}
```

`EmissionService.getCurrentEmissionPrice()` returns `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` — the canonical formula from the spec.

---

## 4. EmissionService — Canonical lifecycle

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:              emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION:  nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION:  afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:              emissionAmount → SYSTEM_BURN_VAULT
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
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
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. `TokenomicsService.getCurrentPrice()` and `EmissionService.getCurrentEmissionPrice()` return the same value

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots so the index survives service restarts.
- **Wire `mintForTransaction()` into all ingestion paths** — the `POST /token/mint` controller endpoint still calls the legacy `mint()`. It should call `mintForTransaction()` so every API entry point follows the canonical flow.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard, and fee split precision.
- **Sync epoch AFC into `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve to the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` therefore undercounts after epoch finalization.
