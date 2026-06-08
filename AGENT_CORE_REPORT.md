# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-08 (updated from 2026-05-12)  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula documented (rewritten in prior pass) |
| `aro_emission_protocol.md` | ✅ Canonical lifecycle documented (rewritten in prior pass) |
| `payment_distribution.md` | ✅ 75/25 split documented (rewritten in prior pass) |
| `burn_and_mint_rules.md` | ✅ Consistent — no conflicts |
| `README.md` | ✅ Architecture overview — no conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code verified

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — see §3 |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT_DEPOSIT only |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; price delegates to reserve index |
| `token.controller.ts` | **FIXED** (2026-06-08): added `POST /emit` canonical endpoint and `GET /emission/price` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

**Controller fix applied this pass:**  
Previously the only HTTP endpoint was `POST /mint`, which called the legacy `TokenService.mint()` — no fee split, no burn, no AFC reserve update. `mintForTransaction()` was unreachable via HTTP.  
Now `POST /api/v1/token/emit` calls `TokenService.mintForTransaction()` → `EmissionService.processTransactionEmission()`.  
Legacy `POST /mint` is preserved with a `@deprecated` annotation for FIAT_DEPOSIT backward compat.

### src/fee_distribution/ — Canonical code verified

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Canonical path reachable via HTTP | **Was missing** | ✅ **Fixed** — `POST /api/v1/token/emit` |

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
POST /api/v1/token/emit
  → TokenService.mintForTransaction()
  → EmissionService.processTransactionEmission(txAmount, recipient, refId, rate?)
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
      ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
      └─ SupplySnapshot:          totalMinted++, totalBurned++, circulatingSupply unchanged
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### HTTP Endpoints (token.controller.ts)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/token/emit` | **Canonical emission** — 1:1 mint + fee split + burn |
| `GET`  | `/api/v1/token/emission/price` | AFC reserve index & state |
| `POST` | `/api/v1/token/mint` | Legacy FIAT_DEPOSIT only (deprecated for emission use) |
| `POST` | `/api/v1/token/burn` | FIAT_WITHDRAWAL + bridge payout |
| `GET`  | `/api/v1/token/supply` | Latest supply snapshot |

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
POST /api/v1/token/emit
{
  "transactionAmount": 10000,
  "recipient": "0xABC...",
  "referenceId": "TX-2026-001"
}

→ Emission       = 10,000 ARO  (1:1 mint → recipient)
→ Commission     = 10,000 × 0.005 = 50 ARO
    Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight at epoch end)
    AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
→ Burn           = 10,000 ARO  (destroyed after TX completes)
→ Net circulating change = 0   (mint and burn cancel out)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split (float precision only)
3. `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` — net zero supply change
4. `reserveIndex` is monotonically non-decreasing — only grows, never shrinks
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Changes Made

### Prior pass (2026-05-12)
- `01_coin_engine/coin_emission_model.md` — replaced `E = F/N` with canonical 1:1 formulas
- `01_coin_engine/aro_emission_protocol.md` — replaced complex load-index formula with canonical lifecycle
- `01_coin_engine/payment_distribution.md` — replaced 60/15/15/5/5 table with 75/25 split

### This pass (2026-06-08)
- `src/token/token.controller.ts` — added `POST /emit` canonical HTTP endpoint and `GET /emission/price`

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with a snapshot on each emission.
- **Epoch AFC sync** — `FeeDistributionService` records AFC reserve to the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory reserve index drifts from epoch distributions. Sync the index after `finalizeEpoch()`.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate (0.99), zero-amount guard.
- **Wire ingestion pipeline** — replace any remaining `tokenService.mint()` calls in the bridge/ingestion path with the canonical `mintForTransaction()` entry point.
