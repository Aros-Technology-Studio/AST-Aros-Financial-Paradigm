# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-HGXO7`  
**Date:** 2026-06-04  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (confirmed, NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical formulas: 1:1 emission, 75/25 split, AFC index |
| `aro_emission_protocol.md` | ✅ Canonical lifecycle documented with Mermaid sequence diagram |
| `payment_distribution.md` | ✅ 75/25 split; historical 60/15/15/5/5 migration noted |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal; no contradictions |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure specification documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only; one file corrected

| File | State |
|------|-------|
| `pot_tx_incentive_distribution.md` | ⚠️ **WAS:** 60% validators / 30% attesters / 10% burn (old draft, 2025-08-24). **FIXED:** Updated to canonical 75% node pool / 25% AFC reserve with PoT-weight sub-distribution. |
| All other `.md` files | ✅ Correct PoT validation, slashing, signature model |

Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in this module.

### src/token/ — Status: Canonical code confirmed correct

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` retained for fiat deposits |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ✅ **ADDED** canonical `POST /api/v1/token/emit` endpoint + `GET /api/v1/token/emission/reserve` + `GET /api/v1/token/emission/price` |

### src/fee_distribution/ — Status: Correct

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

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
| API endpoint for canonical flow | Yes | ✅ `POST /api/v1/token/emit` (added this session) |

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
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### API Endpoints (src/token/token.controller.ts)

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/api/v1/token/emit` | **Canonical** — full 1:1 lifecycle (mint → split → burn → reserve update) |
| `GET`  | `/api/v1/token/emission/reserve` | Returns current AFC reserve state |
| `GET`  | `/api/v1/token/emission/price` | Returns current emission price (reserveIndex) |
| `POST` | `/api/v1/token/mint` | **Legacy** — fiat deposit path, no burn/split |
| `POST` | `/api/v1/token/burn` | Token burn with fiat payout via Bridge |
| `GET`  | `/api/v1/token/supply` | Supply snapshot query |

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on `amount ≤ 0`)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made This Pass (2026-06-04)

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /emit` canonical endpoint, `GET /emission/reserve`, `GET /emission/price`; injected `EmissionService` into controller |
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | Replaced outdated 60/30/10 split with canonical 75/25; added PoT-weight sub-distribution formula and Python example |
| `AGENT_CORE_REPORT.md` | Updated with current session findings (this file) |

---

## 7. Divergences Resolved

| Location | Old Value | Canonical Value | Resolution |
|----------|-----------|-----------------|------------|
| `pot_tx_incentive_distribution.md` | 60% validators / 30% attesters / 10% burn | 75% node pool / 25% AFC reserve | Doc rewritten |
| `token.controller.ts` | No canonical HTTP endpoint | `POST /api/v1/token/emit` | Endpoint added |

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into bridge deposit path** — `BridgeService.handleFiatDepositWebhook()` currently calls legacy `mint()`. If fiat deposits should also apply the canonical emission lifecycle (commission + burn), switch to `mintForTransaction()`. If deposits are intentionally non-transient (user holds the ARO), keep legacy path but document the distinction explicitly.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, commission rate boundary conditions.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory `reserveIndex` after each epoch finalization to keep the price index accurate across both per-TX and per-epoch flows.
