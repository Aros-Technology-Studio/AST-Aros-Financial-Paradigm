# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-9qVL6`  
**Date:** 2026-05-12  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Full canonical protocol with mermaid sequence diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split; historical 60/15/15/5/5 noted and superseded |
| `burn_and_mint_rules.md` | ✅ Describes fiat-gateway burn (separate from canonical emission burn); non-conflicting |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — `calculate()` + `processTransactionEmission()` |
| `emission.service.spec.ts` | ✅ **NEW** — 22 unit tests covering all canonical invariants |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `token.controller.ts` | ✅ **NEW** — `POST /api/v1/token/emit` canonical endpoint added |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` → `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

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
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### Canonical API Endpoint — `POST /api/v1/token/emit`

```json
// Request
{ "txAmount": 10000, "recipient": "WALLET_...", "referenceId": "REF_...", "commissionRate": 0.005 }

// Response
{
  "status": "SUCCESS",
  "referenceId": "REF_...",
  "emissionAmount": 10000,
  "commission": 50,
  "nodeShare": 37.5,
  "afcReserveShare": 12.5,
  "emissionPrice": 1.0000353
}
```

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

## 5. Invariants (enforced and test-verified)

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` — canonical emission HTTP endpoint |
| `src/token/emission.service.spec.ts` | **New file** — 22 unit tests for `EmissionService` (all passing) |
| `AGENT_CORE_REPORT.md` | Updated to reflect this pass |

### Test Results

```
PASS src/token/emission.service.spec.ts
  EmissionService — 22 tests, 0 failures
```

---

## 7. Recommendations (open)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace any remaining `mint()` calls in the bridge/ingestion path with `POST /api/v1/token/emit` or the service method directly.
- **Epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; syncing the in-memory index after each epoch finalization would make `reserveIndex` fully accurate.
