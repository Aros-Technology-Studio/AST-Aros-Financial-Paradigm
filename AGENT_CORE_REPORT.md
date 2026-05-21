# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-mj7Qe`  
**Date:** 2026-05-21  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | Findings |
|------|----------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k worked example — correct |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 split + burn flow — correct |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator weight formula — correct |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

Module 01 is **NOT deprecated** — it is pure documentation. The reference implementation
lives in `src/token/emission.service.ts` (confirmed in `coin_emission_model.md` §Reference Implementation).

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct; controller gap fixed

| File | State before this pass | Action |
|------|------------------------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` | No change |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle | No change |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` | No change |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is no-op; price via `processReserve` | No change |
| `token.module.ts` | ✅ `EmissionService` registered and exported | No change |
| `token.controller.ts` | ❌ No HTTP endpoint for `mintForTransaction()`; `/mint` called legacy path | **Fixed** — added `POST /api/v1/token/emit` and `GET /api/v1/token/emission/reserve` |

### src/fee_distribution/ — Status: Correct

`FeeDistributionService.distributeRewards()` applies the canonical 75/25 split at epoch finalization:
- 75% of collected fees → node pool (weighted by PoT score)
- 25% → `SYSTEM_AFC_RESERVE_000000000000000000`

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic `QueryRunner` |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Canonical endpoint exposed | Required | ✅ Added `POST /api/v1/token/emit` this pass |

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

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### New HTTP Endpoints (added this pass)

```
POST /api/v1/token/emit
Body: { transactionAmount: number, recipient: string, referenceId: string, commissionRate?: number }
Response: EmissionResult + afcReserveIndex

GET /api/v1/token/emission/reserve
Response: AfcReserveState { totalReserve, reserveIndex, transactionCount, lastUpdated }
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
  → every subsequent emission is priced at this higher index
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split; no rounding loss beyond float64 precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (strictly grows with each AFC contribution)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` (canonical entry point) and `GET /api/v1/token/emission/reserve` |
| `tests/test_emission.py` | Added 15 unit tests covering 1:1 ratio, fee split, AFC index, net-zero supply, edge cases |
| `AGENT_CORE_REPORT.md` | Updated with current findings (this file) |

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots so the reserve index survives restarts.
- **Wire epoch AFC into `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` therefore only tracks per-transaction AFC, not epoch-level AFC. Sync the index after each epoch finalization.
- **Deprecate or guard legacy `mint()` endpoint** — `POST /api/v1/token/mint` bypasses the canonical model. Add a deprecation notice or route it through `mintForTransaction()`.
- **Add TypeScript tests for `EmissionService.calculate()`** — mirror the Python tests in `tests/unit/token/emission.spec.ts`.
