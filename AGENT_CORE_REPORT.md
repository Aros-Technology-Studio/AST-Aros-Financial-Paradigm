# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-qGQw3`  
**Date:** 2026-06-03  
**Task:** Full audit of ArosCoin emission logic against the canonical model; fix all divergences

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State | Notes |
|------|-------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, 75/25 split documented correctly |
| `aro_emission_protocol.md` | ✅ Canonical | Full lifecycle with Mermaid sequence diagram |
| `payment_distribution.md` | ✅ Canonical | 75/25 table; historical note about old 60/15/15/5/5 model |
| `burn_and_mint_rules.md` | ✅ Unchanged | Non-contradictory; no emission formulas |
| `README.md` | ✅ Unchanged | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only; one file fixed

| File | Pre-audit state | Action |
|------|----------------|--------|
| `pot_tx_incentive_distribution.md` | ❌ 60% validators, 30% attesters, 10% burn | **Fixed** to canonical 75/25 with correct Python example |
| Other `.md` files | ✅ No emission split specified | No change needed |

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic 4-step QueryRunner TX |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` via `ProcessReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Canonical 75/25 split: `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

### Other docs fixed in this pass

| File | Pre-audit state | Action |
|------|----------------|--------|
| `03_token_management_layer/token_distribution_model.md` | ❌ 60/25/10/5 pool split | **Fixed** to canonical 75/25 with corrected Mermaid diagram |
| `03_token_management_layer/token_issuance_protocol.md` | ❌ 60/25/10/5 table | **Fixed** to canonical 75/25; canonical formula added |
| `08_fee_distribution/epoch_allocation_model.md` | ❌ 60/25/10/5 table | **Fixed** to canonical 75/25; note on governance grants |
| `08_fee_distribution/emission_flow_pipeline.md` | ❌ "60% to confirming node, 40% to treasury" | **Fixed** to 75/25 with system addresses |
| `economic_simulation.md` | ❌ `emission_ratio=0.6`, `burn_ratio=0.1` | **Fixed** — simulation rewritten for canonical 1:1 model; tracks AFC reserve and `reserveIndex` |
| `glossary.md` | ❌ "distributed as 60% to validators" | **Fixed** — full canonical description with $10k example |

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
| Net circulating supply per TX | Zero | ✅ `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged |

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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 6. Documentation Changes Made in This Pass

| File | Change |
|------|--------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | Replaced 60/30/10 with canonical 75/25; updated Python example |
| `03_token_management_layer/token_distribution_model.md` | Replaced 60/25/10/5 pool table with canonical 75/25; updated Mermaid |
| `03_token_management_layer/token_issuance_protocol.md` | Replaced 60/25/10/5 table with canonical 75/25; added canonical formula |
| `08_fee_distribution/epoch_allocation_model.md` | Replaced 60/25/10/5 table with canonical 75/25; clarified AFC reserve purpose |
| `08_fee_distribution/emission_flow_pipeline.md` | Replaced "60% to confirming node, 40% to treasury" with canonical 75/25 |
| `economic_simulation.md` | Replaced `emission_ratio=0.6` / `burn_ratio=0.1` model with canonical 1:1 simulation tracking AFC reserve and `reserveIndex` |
| `glossary.md` | Updated ArosCoin definition from "60% to validators" to canonical 75/25 with $10k example |

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
- **Economic simulation** — the updated `economic_simulation.md` now correctly models the canonical model; the old 0.6/0.1 parameters are removed.
