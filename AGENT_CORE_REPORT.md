# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-U5YST` (delivers on behalf of task `agent/core-emission`)  
**Date:** 2026-05-28  
**Task:** Audit ArosCoin emission logic against the canonical model; rewrite if divergent; add tests; update report.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Current state |
|------|--------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid sequence diagram |
| `payment_distribution.md` | ✅ 75/25 split; historical 60/15/15/5/5 noted as superseded |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal policy; no contradictions |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct types |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `emission.service.spec.ts` | ✅ **NEW** — added in this session; comprehensive unit tests for all invariants |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` delegates to processReserve (legacy compat path) |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics; separate from canonical AFC index |
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
| Unit tests for canonical invariants | Recommended | ✅ **Added** — `src/token/emission.service.spec.ts` |

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

All invariants are now covered by `src/token/emission.service.spec.ts`.

---

## 6. Tests Added in This Session

**File:** `src/token/emission.service.spec.ts`

| Test suite | Scenarios covered |
|------------|-------------------|
| `calculate()` | 1:1 emission, 0.5% fee, 75/25 split, nodeShare+afcShare=commission, custom rate, zero/negative guard, dust amount |
| `getAfcReserveState()` | Initial state (index=1.0, reserve=0), price getter |
| `processTransactionEmission()` | All 4 ledger steps called with correct types and amounts, AFC reserve updated, monotonic index growth, atomic commit, rollback on failure, returned EmissionResult |
| `updateCommissionRate()` | Valid rate applied, boundary rejects (0, 1, negative) |
| Supply snapshot invariant | `totalMinted == totalBurned` per TX cycle |

---

## 7. Gaps Noted (Not Blocking)

| Gap | Description | Recommendation |
|-----|-------------|----------------|
| AFC reserve not persisted | `afcReserveState` is in-memory; lost on restart | Add `AfcReserveEntity` table with periodic snapshots |
| `ingestion.service.ts` uses stub | `// this.tokenService.mint(...)` is commented out | Wire `mintForTransaction()` once `TokenModule` is imported into `IngestionModule` (watch for circular deps) |
| `FeeDistributionService` does not sync `EmissionService.updateAfcReserve()` | Epoch AFC contributions hit the ledger but not the in-memory index | After epoch finalization, call `EmissionService.updateAfcReserve(afcReserve)` |
| `tokenomics.service.getCurrentPrice()` reads from `ProcessReserveLedgerService` | Uses `log1p(volume)/100`; canonical price should come from `EmissionService.getCurrentEmissionPrice()` (sqrt formula) | Migrate callers to `EmissionService` and deprecate the processReserve price path |

---

## 8. Documentation Changes Previously Made (PR #72)

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split; added validator weight formula |

---

## 9. Changes in This Session

| File | Action |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — comprehensive unit tests for all canonical invariants |
| `AGENT_CORE_REPORT.md` | **Updated** — reflects current audit findings, added test coverage section |
