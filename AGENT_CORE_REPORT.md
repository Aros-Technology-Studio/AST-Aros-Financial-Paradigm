# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-5tPyd`  
**Date:** 2026-05-20  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or realign all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, example all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid flow + canonical formulas aligned |
| `payment_distribution.md` | ✅ Canonical | 75/25 split; historical 60/15/15/5/5 noted |
| `burn_and_mint_rules.md` | ✅ Compatible | General burn policy; non-contradictory |
| `README.md` | ✅ Compatible | Architecture overview only |

Module 01 is **pure documentation**. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. **No emission logic here.**

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct field semantics |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `recordEpochAfcContribution()` added (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed + patched

| File | Notes |
|------|-------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies canonical 75/25 split; **patched** to sync epoch AFC inflow into `EmissionService.reserveIndex` |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalisation — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC synced to price index | **Was missing** | ✅ **Fixed:** `emissionService.recordEpochAfcContribution()` called in `distributeRewards()` |

---

## 3. Fix Applied This Pass

### Problem
`FeeDistributionService.distributeRewards()` correctly wrote the 25% epoch AFC share to the ledger (`AFC_RESERVE_*` transaction) but did **not** update the in-memory `afcReserveState` inside `EmissionService`. This meant that `EmissionService.reserveIndex` only reflected per-transaction AFC inflows, not epoch-level inflows, causing the emission price to lag behind reality.

### Solution

**`src/token/emission.service.ts`** — added public wrapper:

```typescript
recordEpochAfcContribution(afcAmount: number): void {
    if (afcAmount <= 0) return;
    this.updateAfcReserve(afcAmount);
}
```

**`src/fee_distribution/fee_distribution.service.ts`** — injected `EmissionService` and called after AFC ledger write:

```typescript
this.emissionService.recordEpochAfcContribution(afcReserve);
```

Both changes are minimal, non-breaking, and keep `updateAfcReserve` private.

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
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT

FeeDistributionService.distributeRewards() — epoch level
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.recordEpochAfcContribution(afcReserve)  ← NEW
  └─ Ledger VALIDATOR_REWARD: nodePool × weight → each node
```

All per-transaction ledger steps execute atomically within a single `QueryRunner` transaction.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only `sqrt` increments, never decremented)
5. All four per-transaction ledger steps succeed or all roll back (atomic `QueryRunner`)
6. Epoch AFC contributions now also update `reserveIndex` (sync gap closed)

---

## 7. Open Recommendations (not blocking)

| Priority | Recommendation |
|----------|---------------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; lost on node restart. Add `AfcReserveEntity` table with periodic snapshots or restore from ledger on startup. |
| Medium | **Add unit tests for `EmissionService.calculate()`** — cover: dust amounts, max commission rate, zero-amount guard, 75+25=100% invariant. |
| Medium | **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in the bridge/ingestion path with the canonical entry point. |
| Low | **Restore `AfcReserveState` from ledger on startup** — sum all `AFC_RESERVE_*` and `AFC_RESERVE_25PCT` ledger entries at boot to prime the in-memory state. |
