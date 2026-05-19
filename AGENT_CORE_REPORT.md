# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-U0M88`  
**Date:** 2026-05-19  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State | Action |
|------|-------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, 75/25 split | Verified correct (patched in prior pass) |
| `aro_emission_protocol.md` | ✅ Full canonical protocol with Mermaid sequence diagram | Verified correct (patched in prior pass) |
| `payment_distribution.md` | ✅ 75/25 canonical split; historical note on old 60/15/15/5/5 | Verified correct (patched in prior pass) |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal policy; non-contradictory | Unchanged |
| `README.md` | ✅ Architecture overview; no formula conflicts | Unchanged |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Documentation only

| File | Pre-patch state | Action |
|------|----------------|--------|
| `pot_tx_incentive_distribution.md` | ❌ Listed old "60% validators, 30% attesters, 10% burn" split | **Fixed** — updated to canonical 75/25 with note on superseded model |
| All other `.md` files | ✅ No conflicting emission formulas | Unchanged |

---

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.service.spec.ts` | ✅ Tests added for `mintForTransaction()` canonical entry point |

---

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
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
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | **Fixed** old 60/30/10 split → canonical 75/25 with historical note |
| `tests/test_emission.py` | **Created** — 19 unit tests covering all invariants (19/19 passing) |
| `src/token/token.service.spec.ts` | **Added** `mintForTransaction()` test suite (canonical entry point) |
| `AGENT_CORE_REPORT.md` | Updated with complete findings from this pass |

### Prior-pass documentation changes (already in repo)

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split |

---

## 7. Test Coverage (tests/test_emission.py)

| Class | Tests | Status |
|-------|-------|--------|
| `TestEmissionRatio` | 3 — 1:1 ratio for various amounts, reference $10k example, custom rate | ✅ All pass |
| `TestCommissionSplit` | 5 — default rate, 75/25 sum, node 75%, AFC 25%, custom rate | ✅ All pass |
| `TestBurnInvariant` | 2 — net delta=0, totalMinted==totalBurned | ✅ All pass |
| `TestAfcReserveIndex` | 5 — index at zero, positive reserve, monotonic growth, reference example, sub-linear | ✅ All pass |
| `TestInputValidation` | 4 — zero amount, negative amount, dust amount, large amount | ✅ All pass |
| **Total** | **19** | **19/19 ✅** |

---

## 8. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add a `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
