# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-6Vy7h`  
**Date:** 2026-05-19  
**Task:** Audit ArosCoin emission logic against the canonical 1:1 model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Pre-audit content | Action taken |
|------|------------------|--------------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index, example already correct | ✅ Confirmed, no change |
| `aro_emission_protocol.md` | Canonical 1:1 formulas, Mermaid flow, Mermaid diagram already correct | ✅ Confirmed, no change |
| `payment_distribution.md` | Canonical 75/25 split already documented | ✅ Confirmed, no change |
| `burn_and_mint_rules.md` | Contained `burnRate: 3% of txn fee` and `dailyMintLimit` parameters that conflict with canonical model | **Updated** — clarified canonical burn (100% of emission, net-zero) vs. bridge/withdrawal path; corrected parameters table |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here; no changes required.

### src/token/ — Status: Canonical code confirmed correct + endpoint added

| File | Verified state | Change |
|------|---------------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct | None |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented | None |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge/FIAT path | None |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` proxies `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op | None |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported | None |
| `token.controller.ts` | ❌ Only exposed legacy `/mint` (FIAT_DEPOSIT) — no canonical emission endpoint | **Added** `POST /api/v1/token/emit` that calls `mintForTransaction()` |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics proxy |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Canonical API endpoint | Yes | ✅ `POST /api/v1/token/emit` (added this session) |

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot():  totalMinted++, totalBurned++, circulatingSupply unchanged
```

All ledger operations execute atomically within a single `QueryRunner` transaction.  
On failure, full rollback — no partial state.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### New API Endpoint (`src/token/token.controller.ts`)

```
POST /api/v1/token/emit
Body: { transactionAmount: number, recipient: string, referenceId: string, commissionRate?: number }
→ calls TokenService.mintForTransaction() → EmissionService.processTransactionEmission()
→ emits 'token.emission.canonical' event for All-Seeing Eye
→ returns { status: 'SUCCESS', ...EmissionResult }
```

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

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` canonical emission endpoint |
| `01_coin_engine/burn_and_mint_rules.md` | Corrected `burnRate`/`dailyMintLimit` confusion; clarified canonical 100% burn vs. bridge path |
| `AGENT_CORE_REPORT.md` | Updated with current audit (this document) |

---

## 7. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into the ingestion pipeline** — replace all remaining `mint()` calls in bridge/ingestion with the canonical entry point where semantically appropriate.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and invariant: `nodeShare + afcShare === commission`.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
- **Governance-bound commission rate change** — `updateCommissionRate()` should require a governance vote record before accepting changes, not just a range check.
