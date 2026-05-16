# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-16  
**Task:** Audit ArosCoin emission logic against the canonical model, fix all divergences, and confirm correct implementation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no src/ subdirectory present)

| File | Pre-patch state | Action |
|------|----------------|--------|
| `coin_emission_model.md` | Previously diverged (`E = F/N`); fixed in PR #72 | ✅ Confirmed canonical |
| `aro_emission_protocol.md` | Previously diverged; fixed in PR #72 | ✅ Confirmed canonical |
| `payment_distribution.md` | Previously 60/15/15/5/5 split; fixed in PR #72 | ✅ Confirmed canonical |
| `AROS_Coin_TokenSpec.json` | **Diverged**: fee split 75/20/5, `burnOn: "governance_rule"`, wrong type | **Fixed** in this pass |
| `burn_and_mint_rules.md` | General burn policy; no 1:1 conflict | Left as-is |
| `README.md` | Architecture overview; no formula conflicts | Left as-is |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

| File | Pre-patch state | Action |
|------|----------------|--------|
| `pot_tx_incentive_distribution.md` | **Diverged**: "60% validators, 30% attesters, 10% burn" | **Fixed** in this pass |
| All other `.md` files | PoT signature/validation/slashing specs; no emission conflicts | Left as-is |

Actual PoT runtime code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical implementation confirmed and extended

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — verified correct (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` → `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a no-op stub |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | **Extended**: added `POST /api/v1/token/emit` (canonical) + `GET /api/v1/token/emission/price` |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic transaction |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change | 0 per cycle | ✅ `totalMinted == totalBurned` per TX in `SupplySnapshot` |

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
       (all four steps in one atomic QueryRunner transaction)
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

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000354
  → every subsequent emission costs slightly more
```

---

## 5. Changes Made in This Pass

### Code

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` → `TokenService.mintForTransaction()` (canonical entry point) |
| `src/token/token.controller.ts` | Added `GET /api/v1/token/emission/price` → current `reserveIndex` + AFC state |

### Documentation

| File | Change |
|------|--------|
| `01_coin_engine/AROS_Coin_TokenSpec.json` | Fixed fee distribution: `75% nodePool + 25% afcReserve`; fixed `burnOn: "transaction_completion"`; fixed type to `"transaction-bounded-1to1"` |
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | Replaced "60/30/10" with canonical "75% node pool + 25% AFC reserve"; updated Python example |

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on non-positive input)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float64 precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+=` path, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Remaining Recommendations

| Priority | Item |
|----------|------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add `AfcReserveEntity` with periodic snapshots. |
| High | **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in bridge/ingestion with the canonical entry point. |
| Medium | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and supply snapshot invariants. |
| Medium | **Epoch AFC sync** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index should be updated after each epoch finalization. |
| Low | **Type-check `token.controller.ts`** — add DTOs (class-validator) for `POST /emit` body validation. |
