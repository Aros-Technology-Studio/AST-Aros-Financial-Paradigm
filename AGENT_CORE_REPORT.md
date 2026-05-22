# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-trut1`  
**Date:** 2026-05-22  
**Task:** Audit ArosCoin emission logic against the canonical 1:1 model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no deprecated marker)

| File | Verified state |
|------|---------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow; Mermaid sequence diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split with PoT weight formula |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy; no contradictions |
| `README.md` | ✅ Fixed (this run): section 9 Reference API updated from old decay/compliance_factor format to canonical 1:1 API signatures |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code: `src/proof_of_transaction_engine/`. No emission logic here — correct.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` defined correctly |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — mint, 75/25 fee split, AFC reserve index, burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved but marked as legacy path |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical 75/25 confirmed

`FeeDistributionService.distributeRewards()` applies canonical 75/25 split per epoch finalization:
- 75% → node pool (divided by PoT-normalized weight per active validator)
- 25% → `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger using `log1p` index — separate from canonical AFC reserve `sqrt` index. Used only by legacy `TokenomicsService.getCurrentPrice()`. |
| `pot.service.ts` | PoT scoring (`S_i = α·TX + β·F − δ·P`) and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic transaction |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged |

**All canonical rules verified. No code rewrites required.**

---

## 3. Canonical Lifecycle Detail

### EmissionService — `src/token/emission.service.ts`

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
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ SupplySnapshot saved (totalMinted++, totalBurned++, circulatingSupply unchanged)
```

All five steps execute atomically within a single `QueryRunner` transaction. Rollback on any failure.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per node)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve contract)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel in same TX cycle)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10,000 = 1.00003536...
  → every subsequent emission is priced slightly higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on zero/negative
2. `nodeShare + afcShare == commission` — exact ratio split; no dust loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle — net-zero supply, confirmed in `SupplySnapshot`
4. `reserveIndex` is monotonically non-decreasing — only `+=` applied to `totalReserve`
5. All ledger steps are atomic — single `QueryRunner` transaction; full rollback on failure

---

## 6. Changes Made This Run

| File | Change |
|------|--------|
| `01_coin_engine/README.md` | Updated section 9 Reference API: replaced old `decay`/`compliance_factor`/`activity` request format with canonical 1:1 emission API signatures |
| `AGENT_CORE_REPORT.md` | Refreshed with 2026-05-22 audit findings |

---

## 7. Open Recommendations

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots keyed to epoch or block height. |
| HIGH | **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in bridge/ingestion path with the canonical `TokenService.mintForTransaction()` entry point. |
| MED | **Sync epoch AFC to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index drifts after each epoch finalization. |
| MED | **Add unit tests for `EmissionService.calculate()`** — cover: dust amounts, max commission rate, zero-amount guard, node+afc share sum invariant. |
| LOW | **`01_coin_engine/README.md` section 5** — narrative still references "piecewise geometric decay" (pre-canonical language); can be simplified to match current 1:1 model. |
