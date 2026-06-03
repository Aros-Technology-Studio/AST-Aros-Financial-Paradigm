# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-fr2pz` (second pass; first pass landed via PR #72 / `claude/inspiring-cannon-4qbjK`)  
**Date:** 2026-06-03  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or align code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC index, example — correct |
| `aro_emission_protocol.md` | ✅ Mermaid sequence diagram, canonical formulas — correct |
| `payment_distribution.md` | ✅ 75/25 table, PoT weight formula, historical note — correct |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; no changes needed |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Runtime code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code confirmed correct + tests added

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `syncEpochAfcContribution()` added |
| `emission.service.spec.ts` | ✅ **New** — 20 unit tests across calculate(), AFC reserve, processTransactionEmission(), updateCommissionRate() |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Epoch AFC sync fixed

| File | Status |
|------|--------|
| `fee_distribution.service.ts` | ✅ `EmissionService` injected; `syncEpochAfcContribution()` called after epoch AFC ledger record |

**Bug fixed:** Previously, epoch-level AFC contributions (25% of collected epoch fees) were written to the ledger but never applied to `EmissionService.afcReserveState`. This meant `getCurrentEmissionPrice()` / `reserveIndex` only reflected per-TX contributions and silently lagged during epoch finalization. Now every epoch call flows through `syncEpochAfcContribution()`.

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

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
| Epoch AFC syncs price index | Yes | ✅ **Fixed** — `syncEpochAfcContribution()` called post-epoch |

---

## 3. Implementation Detail

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

syncEpochAfcContribution(epochAfcAmount)   ← NEW (called by FeeDistributionService)
  └─ updateAfcReserve(epochAfcAmount)
       reserveIndex rises (same formula)
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

## 4. Example: $10,000 Transaction

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

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)
6. Epoch-level AFC contributions are reflected in `reserveIndex` (fixed in this pass)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added `syncEpochAfcContribution()` public method |
| `src/token/emission.service.spec.ts` | **Created** — 20 unit tests for canonical emission |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; call `syncEpochAfcContribution()` after epoch AFC ledger record |
| `AGENT_CORE_REPORT.md` | Updated with second-pass findings |

---

## 7. Open Recommendations (carry-forward)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Epoch `EmissionService.updateAfcReserve` is now called** — but the in-memory state is still volatile. Persistence remains the top priority for production readiness.
