# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-ibuD9`  
**Date:** 2026-05-28  
**Task:** Audit ArosCoin emission logic against the canonical model, verify alignment, add missing test coverage

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC reserve index, 75/25 split documented correctly |
| `aro_emission_protocol.md` | ✅ Canonical | Full mermaid lifecycle, canonical formulas, atomic 4-step flow |
| `payment_distribution.md` | ✅ Canonical | 75/25 split table; historical note on superseded 60/15/15/5/5 split |
| `burn_and_mint_rules.md` | ✅ Consistent | General burn-on-withdrawal policy; no conflicts |
| `README.md` | ✅ Consistent | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here; no action needed.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented and verified |
| `emission.service.spec.ts` | ✅ **NEW** — 18 unit tests added this pass (see §4) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics. Separate from canonical AFC reserve in `EmissionService`. |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

### tests/ — Status: Tests added this pass

| File | Change |
|------|--------|
| `tests/test_emission.py` | **Was empty.** Filled with 16 Python cross-language tests; all pass (0 failures) |
| `src/token/emission.service.spec.ts` | **New file.** 18 Jest unit tests for `EmissionService` |

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

**Verdict: code fully conforms to the canonical model. No corrections to emission logic were required.**

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
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

## 5. Test Coverage Added (This Pass)

### `src/token/emission.service.spec.ts` — 18 Jest unit tests

| Group | Tests |
|-------|-------|
| `calculate()` — pure function | 1:1 invariant, default rate 0.5%, nodeShare 75%, afcShare 25%, sum check, custom rate, zero/negative/dust guard |
| AFC reserve index | Starts at 1.0, rises after TX, monotonically non-decreasing, sqrt formula |
| `processTransactionEmission()` | MINT→FEE×2→BURN ledger order, correct MINT amount, correct BURN amount, 75/25 recipients, commit on success, rollback on failure, zero amount guard |

### `tests/test_emission.py` — 16 Python tests (cross-language verification)

All 16 pass (`python3 -m unittest tests/test_emission.py -v`):

```
test_afc_index_formula_sqrt          ... ok
test_afc_index_monotonically_*       ... ok
test_afc_index_rises_with_reserve    ... ok
test_afc_index_starts_at_1           ... ok
test_afc_share_is_25pct              ... ok
test_canonical_example_10k           ... ok
test_custom_commission_rate          ... ok
test_default_commission_rate         ... ok
test_dust_amount                     ... ok
test_emission_equals_tx_amount       ... ok
test_emission_equals_tx_various      ... ok
test_negative_amount_raises          ... ok
test_net_supply_change_is_zero       ... ok
test_node_share_is_75pct             ... ok
test_split_sums_to_commission        ... ok
test_zero_amount_raises              ... ok
Ran 16 tests in 0.000s — OK
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index will diverge after epoch finalization. Consider syncing the index after each epoch finalization.
- **Deprecation timeline for legacy `mint()`** — schedule removal once all callers are migrated to `mintForTransaction()`.
