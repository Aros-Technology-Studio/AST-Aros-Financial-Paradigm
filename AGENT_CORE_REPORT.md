# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-mpHi3`  
**Date:** 2026-05-12  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no executable source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical | Full lifecycle, Mermaid sequence diagram |
| `payment_distribution.md` | ✅ Canonical | 75/25 split; historical note on old 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Compatible | General burn/mint governance; no formula conflicts |
| `README.md` | ✅ Compatible | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Fixed in this pass

| File | Pre-patch | Action |
|------|-----------|--------|
| `pot_tx_incentive_distribution.md` | ⚠️ 60/30/10 split (validators/attesters/burn) — diverged from canonical 75/25 | **Rewritten** to canonical 75/25 with historical note |
| All other `.md` files | ✅ No emission formulas | Left as-is |

---

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic QueryRunner; AFC index |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat-bridge compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` → `processReserve.reserveIndex`; `updateInternalValuation()` deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|----------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change per TX | 0 | ✅ `totalMinted == totalBurned` per cycle in `SupplySnapshot` |

All rules: **PASS**.

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount              // 1:1, no multiplier
  │    commission     = txAmount × rate       // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ [atomic QueryRunner transaction]
  │    MINT            emissionAmount → recipient
  │    FEE_DISTRIBUTION nodeShare    → SYSTEM_NODE_POOL
  │    FEE_DISTRIBUTION afcShare     → SYSTEM_AFC_RESERVE
  │    updateAfcReserve(afcShare):
  │       reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  │    BURN            emissionAmount → SYSTEM_BURN_VAULT
  │    SupplySnapshot: totalMinted+= , totalBurned+= , circulatingSupply unchanged
  └─ commitTransaction / rollbackTransaction on error
```

All five steps execute atomically; on any failure the entire TX is rolled back.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight across active validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on negative/zero input.
2. `nodeShare + afcShare == commission` — exact split; no rounding loss beyond float precision.
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply).
4. `reserveIndex` is monotonically non-decreasing — only increases via `updateAfcReserve()`.
5. All four ledger steps plus snapshot succeed or all roll back (atomic QueryRunner).

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | Replaced 60/30/10 split with canonical 75/25; added TS reference snippet and historical note |
| `AGENT_CORE_REPORT.md` | Rewritten for current branch with complete audit findings |

Previous-session changes (already merged via PR #72 → `agent/core-emission`):
- `01_coin_engine/coin_emission_model.md` — canonical formulas
- `01_coin_engine/aro_emission_protocol.md` — canonical formulas + Mermaid diagram
- `01_coin_engine/payment_distribution.md` — canonical 75/25 split
- `src/token/emission.service.ts` — full canonical implementation
- `src/token/emission.interfaces.ts` — typed interfaces
- `src/token/token.service.ts` — `mintForTransaction()` canonical entry point

---

## 7. Recommendations

1. **Persist `AfcReserveState` to DB** — currently in-memory; state is lost on service restart. Add an `AfcReserveEntity` table with upsert on each emission cycle.
2. **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `token.service.mint()` calls in the fiat-bridge path with the canonical entry point once fiat-amount → token-amount conversion is confirmed.
3. **Unit tests for `EmissionService.calculate()`** — cover dust amounts, maximum commission rate boundary, zero-amount guard, and `nodeShare + afcShare == commission` invariant.
4. **Sync epoch AFC to `EmissionService`** — `FeeDistributionService.distributeRewards()` credits the AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` therefore under-counts epoch-level contributions. Add a callback or event after each epoch finalization.
