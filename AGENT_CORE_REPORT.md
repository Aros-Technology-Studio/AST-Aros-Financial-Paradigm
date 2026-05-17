# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-E1PyY`  
**Date:** 2026-05-17  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Describes canonical 1:1 formula, AFC reserve index, 75/25 split, burn lifecycle |
| `aro_emission_protocol.md` | ✅ Canonical formulas (previously patched by prior agent pass) |
| `payment_distribution.md` | ✅ 75/25 canonical split (previously patched) |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; left unchanged |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Audit Results

| File | Status | Notes |
|------|--------|-------|
| `emission.interfaces.ts` | ✅ Correct | `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly defined |
| `emission.service.ts` | ✅ Correct | Full canonical 1:1 lifecycle; all 4 ledger steps atomic |
| `token.service.ts` | ✅ Correct | `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT-deposit path |
| `tokenomics.service.ts` | ✅ Correct | `updateInternalValuation()` is a deprecated no-op; price delegates to reserve index |
| `token.module.ts` | ✅ Correct | `EmissionService` registered and exported |
| `token.controller.ts` | ⚠️ **GAP FOUND → FIXED** | See §3 |

### src/fee_distribution/ — Status: Correct

`FeeDistributionService.distributeRewards()` applies canonical 75/25 split: 75% node pool, 25% AFC reserve.

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Process-volume ledger with log1p index — used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX block |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Canonical path exposed via API | **Previously: No** | ✅ **Fixed: `POST /api/v1/token/emit`** |

---

## 3. Gap Found and Fixed — `token.controller.ts`

### Problem

The HTTP API layer had no canonical emission endpoint. All traffic to `POST /api/v1/token/mint` routed to the **legacy** `TokenService.mint()` method, which:

- Records a simple MINT ledger transaction (FIAT_DEPOSIT semantics)
- Does **not** apply the 1:1 emission model
- Does **not** split fees 75/25 to nodes and AFC reserve
- Does **not** burn emitted ARO after the TX completes
- Calls deprecated `tokenomics.updateInternalValuation()` instead of updating the AFC reserve index

The canonical `TokenService.mintForTransaction()` — which correctly delegates to `EmissionService.processTransactionEmission()` — was implemented but unreachable from the API.

### Fix Applied

Added two new endpoints to `src/token/token.controller.ts`:

```
POST /api/v1/token/emit
Body: { transactionAmount: number, recipient: string, referenceId: string, commissionRate?: number }
→ Calls TokenService.mintForTransaction() → EmissionService.processTransactionEmission()
→ Returns: EmissionResult (emissionAmount, commission, nodeShare, afcReserveShare, commissionRate)
```

```
GET /api/v1/token/emission/state
→ Returns: { afcReserve: AfcReserveState, emissionPrice: number }
```

`EmissionService` was injected into `TokenController` (it was already exported from `TokenModule`).

The legacy `POST /api/v1/token/mint` (FIAT deposit) and `POST /api/v1/token/burn` (FIAT withdrawal) are preserved unchanged.

---

## 4. Implementation Detail — Full Canonical Lifecycle

### EmissionService (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1, no multiplier
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient         (Step 1)
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL       (Step 2a)
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE     (Step 2b)
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000          (Step 3)
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT  (Step 4)
     └─ updateSupplySnapshot (totalMinted+, totalBurned+, circulatingSupply unchanged)
```

All four ledger operations and the supply snapshot update execute within a single `QueryRunner` transaction; any failure rolls back the snapshot (ledger records use `LedgerService` own repository — see §5 for persistence note).

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
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out per cycle)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants Verified

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split, floating-point precision only
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+=` path, never decremented)
5. All four ledger steps + snapshot succeed or all roll back (atomic QueryRunner)

---

## 7. Outstanding Recommendations

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; index is lost on service restart. Add an `AfcReserveEntity` table, restore on boot from latest snapshot. |
| HIGH | **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in the bridge/ingestion path (`BridgeService`, `IngestionService`) with the canonical `mintForTransaction()` where applicable. |
| MEDIUM | **Sync AFC index after epoch finalization** — `FeeDistributionService.distributeRewards()` records the 25% AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index diverges from the ledger after each epoch. |
| MEDIUM | **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary (rate → 1), zero-amount guard, and integer rounding consistency. |
| LOW | **Consolidate `ProcessReserveLedgerService`** — uses a different formula (`log1p`) than `EmissionService` (`sqrt / 10_000`); the two indexes diverge at scale. Consider deprecating the `log1p` index in favour of the canonical AFC reserve index. |
