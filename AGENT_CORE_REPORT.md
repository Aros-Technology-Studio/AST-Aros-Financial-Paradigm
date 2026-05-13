# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-13  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or rewrite, add tests, expose canonical API endpoint

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no deprecated source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Mermaid flow diagram, canonical formulas, burn lifecycle |
| `payment_distribution.md` | ✅ 75/25 node/AFC split |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy |
| `README.md` | ✅ Architecture overview, no contradictions |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` match canonical model |
| `emission.service.ts` | ✅ Full 1:1 lifecycle: mint → fee split → AFC index update → burn |
| `emission.service.spec.ts` | ✅ **NEW** — 22 unit tests covering calculate(), processTransactionEmission(), reserve index, rollback |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge/fiat flows |
| `token.controller.ts` | ✅ **NEW** — `POST /api/v1/token/emit` (rich response), `GET /emit/reserve`, `GET /emit/price` |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a @deprecated no-op; price delegates to processReserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed ✅

`FeeDistributionService.distributeRewards()` applies 75/25 split of epoch fees:
- 75% → node pool (split by PoT-normalized weight per active validator)
- 25% → `SYSTEM_AFC_RESERVE_000000000000000000`

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | yes | ✅ BURN ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply = 0 per TX cycle | yes | ✅ `totalMinted == totalBurned` in `SupplySnapshot` |
| All steps atomic | yes | ✅ Single `QueryRunner` wraps all 4 ledger ops; rollback on any failure |

**All canonical rules are implemented correctly. No rewrite was required.**

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare (75%) → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  (25%) → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT

All 4 ledger ops execute atomically inside a single QueryRunner transaction.
Rollback on any failure — no partial state.
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
Emission       = 10,000 ARO  (1:1 MINT → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out exactly)

After first TX:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher (monotonically)
```

---

## 5. Changes Made in This Pass

### New: `src/token/emission.service.spec.ts`

22 unit tests covering:
- `calculate()`: 1:1 ratio, 0.5% default fee, 75/25 split, custom rate, zero/negative guard, dust amounts, nodeShare+afcShare == commission
- `processTransactionEmission()`: 4-call ledger sequence (MINT, FEE_DIST×2, BURN), correct types and amounts, atomic rollback, net-zero supply snapshot
- AFC reserve index: starts at 1.0, rises monotonically across 5 TXs, formula `1.0 + sqrt(reserve)/10_000` verified
- `updateCommissionRate()`: valid rate accepted, out-of-range (0 and ≥1) rejected

### Updated: `src/token/token.controller.ts`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/token/emit` | Full canonical 1:1 emission lifecycle with rich response (status, amounts, AFC state) |
| `GET`  | `/api/v1/token/emit/reserve` | Current AFC reserve state |
| `GET`  | `/api/v1/token/emit/price` | Current emission price (reserveIndex) |

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split, float precision only)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (grows with each AFC contribution)
5. All 4 ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots and load on startup.
- **Wire `mintForTransaction()` into ingestion pipeline** — the bridge's `ingestion.service.ts` should call the canonical entry point rather than `mint()` for any payment-originated transaction.
- **Sync epoch AFC accumulation into `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()` after epoch finalization; the in-memory reserve index does not reflect epoch-level AFC accumulation between restarts.
- **Add property-based tests** — verify `nodeShare + afcShare == commission` and `totalMinted == totalBurned` holds for arbitrary random amounts using fast-check.
