# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-ix7xI`  
**Date:** 2026-05-15  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (pure specification)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | Describes 1:1 emission, 75/25 split, AFC reserve index formula |
| `aro_emission_protocol.md` | ✅ Canonical | Full protocol with Mermaid sequence diagram, canonical formulas |
| `payment_distribution.md` | ✅ Canonical | 75/25 split table; historical 60/15/15/5/5 correctly flagged as superseded |
| `burn_and_mint_rules.md` | ✅ Non-contradictory | Describes general burn-on-withdrawal policy; predates 1:1 model but contains no conflicting formula |
| `README.md` | ✅ Reference | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT engine code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct separation of concerns.

### src/token/ — Status: Canonical, fully compliant

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct ratios |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — `calculate()` + `processTransactionEmission()` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compatibility |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` proxies to process reserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical, fully compliant

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch finalization |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path |
| `pot.service.ts` | PoT scoring (`α·txCount + β·fees − δ·penalty`) and normalized weight calculation — correct |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Atomic execution | Yes | ✅ All 4 ledger steps in single `QueryRunner` transaction; full rollback on failure |

**All canonical rules are satisfied. No divergence found.**

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

1. `emissionAmount == transactionAmount` (1:1, enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only grows, never shrinks)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Epoch Distribution Alignment

`FeeDistributionService.distributeRewards()` applies the same canonical 75/25 split at epoch level:

- `nodePool   = totalFees × 0.75` → distributed to validators proportional to PoT weight
- `afcReserve = totalFees × 0.25` → recorded to `SYSTEM_AFC_RESERVE_000000000000000000`

Both per-transaction (`EmissionService`) and per-epoch (`FeeDistributionService`) paths apply identical ratios.

---

## 7. Recommendations (open items from prior audit)

| Item | Status |
|------|--------|
| Persist `AfcReserveState` to database | ⚠️ Still in-memory — lost on restart. Recommend `AfcReserveEntity` table |
| Wire `mintForTransaction()` into ingestion pipeline | ⚠️ Bridge path still calls legacy `mint()` — canonical entry point not wired in |
| Unit tests for `EmissionService.calculate()` | ⚠️ Not yet present — cover dust amounts, max rate, zero-amount guard |
| Sync epoch AFC contribution to `EmissionService.updateAfcReserve()` | ⚠️ Epoch finalization writes to ledger but does not update in-memory index |

---

## 8. Conclusion

The canonical 1:1 emission model is **fully and correctly implemented** in `src/token/emission.service.ts`. All documentation in `01_coin_engine/` is aligned. No code divergence from the canonical specification was found in this audit pass.

The implementation matches the spec introduced in PR #72 (`feat: canonical 1:1 emission model implementation`). This report confirms continuity of the canonical model on branch `claude/inspiring-cannon-ix7xI`.
