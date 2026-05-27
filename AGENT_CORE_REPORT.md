# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-bsEBJ`  
**Date:** 2026-05-27  
**Task:** Audit ArosCoin emission logic against the canonical model; fix any divergence; confirm compliance

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

The module contains spec documents, not source code. The canonical implementation lives in `src/token/`.

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical protocol — mermaid sequence, governance table |
| `payment_distribution.md` | ✅ Canonical 75/25 split with validator weight formula |
| `burn_and_mint_rules.md` | ✅ Correct general burn-on-completion policy |
| `README.md` | ✅ Architecture overview — no formula conflicts |

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical implementation (verified + improved)

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; **added** public `recordEpochAfcContribution()` |
| `emission.service.spec.ts` | ✅ **New** — 18 unit tests covering calculate(), burn/mint lifecycle, AFC reserve, edge cases |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` from `processReserve`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/fee_distribution/ — Status: Canonical (fixed epoch–EmissionService sync)

| File | State |
|------|-------|
| `fee_distribution.service.ts` | ✅ 75/25 split; **fixed** — now calls `emissionService.recordEpochAfcContribution()` after epoch AFC record |

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
| Epoch AFC synced into price index | Yes | ✅ **Fixed** — `recordEpochAfcContribution()` called after epoch finalization |

---

## 3. Gap Fixed in This Pass

### Problem
`FeeDistributionService.distributeRewards()` recorded the 25% epoch-level AFC share to the ledger but did **not** call `EmissionService.updateAfcReserve()`. This meant the in-memory `reserveIndex` only reflected per-transaction AFC flows, causing the emission price to undercount scale-of-network activity.

### Fix
Added public method to `EmissionService`:
```typescript
recordEpochAfcContribution(afcAmount: number): void {
    if (afcAmount <= 0) return;
    this.updateAfcReserve(afcAmount);
}
```

Injected `EmissionService` into `FeeDistributionService` and called it after each epoch AFC record:
```typescript
// Sync epoch AFC contribution into EmissionService price index
this.emissionService.recordEpochAfcContribution(afcReserve);
```

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

recordEpochAfcContribution(epochAfcAmount)   ← called by FeeDistributionService
  └─ updateAfcReserve(epochAfcAmount)
       reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
```

All four per-TX ledger operations execute atomically within a single `QueryRunner` transaction.

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
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. Epoch-level AFC now also feeds `reserveIndex` — price index fully tracks all reserve inflows

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots or hydrate from ledger on startup.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Epoch-start AFC hydration** — on service startup, replay confirmed `AFC_RESERVE_*` ledger entries to reconstruct `totalReserve` and avoid cold-start price index deflation.
