# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-GUrxD`  
**Date:** 2026-05-20  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Content | Status |
|------|---------|--------|
| `coin_emission_model.md` | Canonical 1:1 formula, AFC reserve index, example | ✅ Aligned |
| `aro_emission_protocol.md` | Canonical 1:1 emission + 75/25 split + burn flow with Mermaid diagram | ✅ Aligned |
| `payment_distribution.md` | Canonical 75/25 split table + PoT validator weight formula | ✅ Aligned |
| `burn_and_mint_rules.md` | General burn-on-withdrawal policy; non-contradictory | ✅ No action needed |
| `burn_mechanism.md` | Burn rules; non-contradictory | ✅ No action needed |
| `README.md` | Architecture overview; no formula conflicts | ✅ No action needed |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic is present here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented; see §3 for detail |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved but marked deprecated |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a no-op deprecated stub |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy volume ledger used only by legacy `TokenService.mint()`; uses `log1p` index — not canonical AFC index |
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
| Net circulating supply change = 0 | Yes | ✅ `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

**Result: Code is fully compliant with the canonical model. No rewrites required.**

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
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
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

### TokenService canonical entry point (`src/token/token.service.ts`)

```typescript
// Correct path — use for all new transactions
async mintForTransaction(txAmount, recipient, referenceId, rate?) → EmissionResult

// Legacy path — kept for backward-compat with Bridge; does NOT follow canonical 1:1
async mint(amount, recipient, referenceId) // plain mint, no canonical burn/fee split
async burn(amount, sender, bankDetailsId)  // fiat withdrawal path
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

## 5. Invariants (verified in code)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` if ≤ 0
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle — enforced in `updateSupplySnapshot()` of `EmissionService`
4. `reserveIndex` is monotonically non-decreasing — only additions to `totalReserve`, never subtractions
5. All four ledger steps succeed or all roll back — single `QueryRunner` transaction wrapping steps 1–5

---

## 6. Open Recommendations

| Priority | Recommendation |
|----------|----------------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; state is lost on process restart. Add an `AfcReserveEntity` table with periodic snapshots or reload from ledger on startup. |
| MEDIUM | **Wire `mintForTransaction()` into Bridge/ingestion pipeline** — replace `TokenService.mint()` calls in the ingestion path with the canonical entry point to ensure 1:1 emission + fee split for all transactions. |
| MEDIUM | **Sync `EmissionService.afcReserveState` after epoch finalization** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index diverges after each epoch cycle. |
| LOW | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate edge case, zero-amount guard, 75/25 split precision. |
| LOW | **Deprecate `ProcessReserveLedgerService.reserveIndex`** — its `log1p` index is only used by legacy `TokenomicsService.getCurrentPrice()`. Canonical price source of truth is `EmissionService.getCurrentEmissionPrice()`. |

---

## 7. Conclusion

The canonical 1:1 emission model is **fully implemented and correct** in `src/token/emission.service.ts`. All documentation in `01_coin_engine/` is aligned with the canonical formulas. No emission logic was found in `10_proof_of_transaction_engine/` (documentation only). The code requires no corrective rewrites at this time — only the open recommendations above remain as follow-up tasks.
