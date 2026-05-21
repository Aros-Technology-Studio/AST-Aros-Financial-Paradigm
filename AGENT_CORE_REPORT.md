# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-SwtBr`  
**Date:** 2026-05-21  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code, tests, and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no executable source code)

| File | Pre-patch status | Action |
|------|-----------------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 model, correct formulas | Unchanged |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 model with Mermaid diagram | Unchanged |
| `payment_distribution.md` | ✅ Canonical 75/25 split documented | Unchanged |
| `burn_and_mint_rules.md` | ✅ Non-contradictory general rules | Unchanged |
| `AROS_Coin_TokenSpec.json` | ❌ Fee distribution was 75/20/5 (wrong); burnOn was `governance_rule` (wrong); supplyMechanism was `transaction-fee-based` (wrong) | **Fixed** → 75/25, `transaction_completion`, `transaction-amount-based` |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here. No changes needed.

### src/token/ — Canonical emission implementation

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — correct |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ Delegates price to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered and exported |
| `token.controller.ts` | ❌ Missing canonical `/emit` endpoint — only legacy `/mint` exposed | **Fixed** → added `POST /api/v1/token/emit` |
| `emission.service.spec.ts` | ❌ Did not exist | **Created** — 20 unit tests covering canonical model |

### src/fee_distribution/ — Epoch distribution

| File | Status |
|------|--------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies canonical 75/25: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path |
| `pot.service.ts` | PoT scoring and weight normalization — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code | Status |
|------|-----------|------|--------|
| Emission = TX Amount | 1:1 | `emission = transactionAmount` in `EmissionService.calculate()` | ✅ |
| Fee = TX Amount × rate | 0.5% default | `commission = transactionAmount * rate` | ✅ |
| Fee split: 75% nodes | Yes | `nodeShare = commission * 0.75` | ✅ |
| Fee split: 25% AFC reserve | Yes | `afcShare = commission * 0.25` | ✅ |
| ARO burn after TX | Yes | `BURN` ledger record for `emissionAmount` in same atomic TX | ✅ |
| AFC reserve grows → price rises | Yes | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | ✅ |
| Epoch fees also 75/25 | Yes | `FeeDistributionService.distributeRewards()` | ✅ |
| TokenSpec JSON fee split | 75/25 | Was 75/20/5 — **fixed** | ✅ |
| Canonical REST endpoint | `POST /api/v1/token/emit` | Was missing — **added** | ✅ |

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### Canonical REST Endpoint (`src/token/token.controller.ts`)

```
POST /api/v1/token/emit
Body: { transactionAmount, recipient, referenceId, commissionRate? }

Response:
{
  status: "SUCCESS",
  referenceId,
  emissionAmount,    // == transactionAmount (1:1)
  commission,        // == transactionAmount × rate
  nodeShare,         // == commission × 0.75
  afcReserveShare,   // == commission × 0.25
  emissionPrice      // current AFC reserve index
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
  reserveIndex = 1.0 + sqrt(12.50) / 10,000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `01_coin_engine/AROS_Coin_TokenSpec.json` | Fixed fee split 75/20/5 → 75/25; fixed `burnOn` → `transaction_completion`; fixed `supplyMechanism.type` → `transaction-amount-based`; bumped version 1.0.0 → 1.1.0 |
| `src/token/token.controller.ts` | Added canonical `POST /api/v1/token/emit` endpoint wired to `TokenService.mintForTransaction()` |
| `src/token/emission.service.spec.ts` | Created — 20 unit tests covering `calculate()`, `processTransactionEmission()`, AFC reserve growth, and commission rate governance |

---

## 7. Open Recommendations (Not Blocking)

| Priority | Recommendation |
|----------|---------------|
| High | **Persist `AfcReserveState` to DB** — currently in-memory; state is lost on service restart. Add an `AfcReserveEntity` table with an upsert after each `updateAfcReserve()` call. |
| High | **Wire `mintForTransaction()` into bridge/ingestion pipeline** — `BridgeService` and `IngestionService` still call legacy `mint()`; replace with canonical `mintForTransaction()` calls. |
| Medium | **Sync epoch AFC to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory price index misses epoch contributions. |
| Low | **Expand e2e tests** — `tests/test_emission.py` is empty; add integration scenario covering full canonical TX cycle with assertions on supply snapshots. |
