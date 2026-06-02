# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-sTLDR`  
**Date:** 2026-06-02  
**Task:** Audit ArosCoin emission logic against the canonical model; fix any divergences

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, example — correct |
| `aro_emission_protocol.md` | ✅ Canonical formulas, Mermaid flow diagram — correct |
| `payment_distribution.md` | ✅ Canonical 75/25 split, PoT weight formula — correct |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal policy — non-contradictory |
| `README.md` | ✅ Architecture overview — no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution. Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Primary audit scope

| File | Pre-fix state | Action |
|------|--------------|--------|
| `emission.interfaces.ts` | ✅ Correct — `EmissionResult`, `EmissionConfig`, `AfcReserveState` | No change |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented | No change |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` | No change |
| `tokenomics.service.ts` | ❌ `getCurrentPrice()` used `ProcessReserveLedgerService` (log1p) instead of canonical `EmissionService` (sqrt) | **Fixed** |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported | No change |
| `emission.service.spec.ts` | ❌ Missing — no unit tests for `EmissionService.calculate()` | **Created** |

### src/fee_distribution/ — Status: Correct, unchanged

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Canonical 75/25 split per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | PoT volume ledger with log1p index — **not** the canonical AFC reserve; used only by legacy `TokenService.mint()` |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

---

## 2. Fix: tokenomics.service.ts — Wrong Price Source

### Problem

`TokenomicsService.getCurrentPrice()` was reading from `ProcessReserveLedgerService`:

```typescript
// BEFORE — WRONG (log1p formula, not canonical)
getCurrentPrice(): number {
    const state = this.processReserve.getReserveState();
    return state.reserveIndex;
}
```

`ProcessReserveLedgerService` computes its index as:

```
reserveIndex = 1.0 + log1p(totalProcessVolume) / 100
```

This is a process-volume ledger, **not** the canonical AFC reserve. The canonical AFC reserve index (source of truth for emission price) lives in `EmissionService`:

```
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

### Fix

Replaced `ProcessReserveLedgerService` dependency in `TokenomicsService` with `EmissionService`:

```typescript
// AFTER — CORRECT
getCurrentPrice(): number {
    return this.emissionService.getCurrentEmissionPrice();
}
```

`EmissionService.getCurrentEmissionPrice()` returns the canonical AFC reserve index, which is monotonically non-decreasing and directly tied to AFC accumulation from transaction commissions.

---

## 3. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Price source: `TokenomicsService.getCurrentPrice()` | EmissionService | ✅ **Fixed** in this session |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

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
2. `nodeShare + afcShare == commission` (exact split, verified by unit tests)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 7. Changes Made in This Session

| File | Change |
|------|--------|
| `src/token/tokenomics.service.ts` | Replaced `ProcessReserveLedgerService` with `EmissionService`; fixed `getCurrentPrice()` to use canonical sqrt-based AFC reserve index |
| `src/token/emission.service.spec.ts` | Created — 12 unit tests covering `calculate()` formulas, invariants, edge cases, and `processTransactionEmission()` lifecycle |
| `AGENT_CORE_REPORT.md` | Rewritten to document this audit pass |

**Test result:** 83 tests, all passing.

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace any remaining `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
