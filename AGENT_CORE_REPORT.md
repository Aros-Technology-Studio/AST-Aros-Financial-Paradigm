# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-WECdU`  
**Date:** 2026-05-31  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical — 1:1 formula, AFC index, 75/25 split, example |
| `aro_emission_protocol.md` | ✅ Canonical — Mermaid flow diagram, all four ledger steps |
| `payment_distribution.md` | ✅ Canonical — 75/25 split with PoT weighting |
| `burn_mechanism.md` | ✅ Non-contradictory, left as-is |
| `README.md` | ✅ Architecture overview, no conflicts |

**Module 01 is NOT deprecated.** It is pure documentation; canonical source lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical ✅ (gap in controller fixed — see §3)

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — mint → fee split → burn → AFC index |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a documented no-op; `getCurrentPrice()` proxies reserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ✅ **Fixed** — added `POST /mint/transaction` and `GET /emission/state` (see §3) |

### src/fee_distribution/ — Status: Canonical ✅

`FeeDistributionService.distributeRewards()` applies the correct 75/25 split at epoch finalization.

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

`pot.service.ts` handles PoT scoring and weight normalization.  
`process_reserve.service.ts` maintains a volume ledger used by the legacy tokenomics path.

---

## 2. Canonical Model Verification

| Rule | Canonical | Code |
|------|-----------|------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

---

## 3. Gap Found and Fixed

### Problem

`TokenController` exposed only `POST /api/v1/token/mint`, which calls the **legacy** `TokenService.mint()`.  
The legacy path does **not** implement the canonical model — it mints without a fee split, without burn, and without updating the AFC reserve index.

The canonical `TokenService.mintForTransaction()` (delegating to `EmissionService`) was implemented correctly but had no HTTP entry point, making the canonical model unreachable via the API.

### Fix Applied

**`src/token/token.controller.ts`** — two additions:

```
POST /api/v1/token/mint/transaction
  Body: { amount: number, recipient: string, refId: string, commissionRate?: number }
  → calls TokenService.mintForTransaction()
  → full canonical 1:1 lifecycle (emit, fee split, burn, AFC index update)

GET /api/v1/token/emission/state
  → returns AfcReserveState + currentEmissionPrice
```

`EmissionService` is now injected directly into `TokenController` (already exported by `TokenModule`).

---

## 4. Canonical Emission Lifecycle

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
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add a `AfcReserveEntity` table with periodic snapshots.
- **Deprecate `POST /mint` (legacy)** — route all callers to `POST /mint/transaction`. Keep legacy endpoint behind a feature flag until callers are migrated.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; sync the in-memory index after each epoch finalization.
