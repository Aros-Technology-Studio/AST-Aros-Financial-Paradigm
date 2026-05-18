# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-bCRnU`  
**Date:** 2026-05-18  
**Task:** Re-audit ArosCoin emission logic against the canonical model; add missing unit tests; confirm all code and documentation are aligned

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

All documentation was aligned with the canonical model in a prior pass (PR #72). Re-audit confirms they remain correct.

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid sequence diagram of full lifecycle |
| `payment_distribution.md` | ✅ 75/25 split, PoT-weight validator sub-distribution, AFC reserve purpose |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; no formula conflicts |
| `README.md` | ✅ Architecture overview; references canonical source |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution. No emission logic present. Actual PoT engine code lives in `src/proof_of_transaction_engine/`. No action required.

---

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct fields |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: calculate → MINT → FEE_DIST × 2 → AFC update → BURN (atomic) |
| `token.service.ts` | ✅ `mintForTransaction()` is canonical entry point; delegates to `EmissionService`; legacy `mint()` preserved for bridge path |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is `@deprecated` no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `emission.service.spec.ts` | ✅ **NEW** — Added in this pass (see §4) |

---

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25`; both ledger records present |
| `fee_distribution.service.test.ts` | ✅ Existing tests cover epoch lifecycle and distribution trigger |

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used only by legacy `TokenomicsService.getCurrentPrice()` (not the canonical price source) |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| nodeShare + afcShare == commission | Yes | ✅ exact split, enforced by test |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot` updated: mint and burn cancel out per TX cycle |
| All four ledger steps atomic | Yes | ✅ single `QueryRunner` transaction with rollback on any failure |

**All canonical rules are satisfied.**

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
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot(): totalMinted++, totalBurned++, circulatingSupply unchanged
```

All five operations execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Unit Tests Added — `src/token/emission.service.spec.ts`

Added in this pass to address the open recommendation from the prior audit.

Coverage:

| Suite | Cases |
|-------|-------|
| `calculate()` | 1:1 emission, default 0.5% rate, 75/25 split, split adds to commission, custom rate, dust amounts, zero amount guard, negative amount guard, large amounts |
| AFC reserve index | Starts at 1.0, rises monotonically after each emission, never decreases, `getCurrentEmissionPrice()` returns `reserveIndex`, follows `sqrt` formula |
| `processTransactionEmission()` | Emits 4 ledger records, first is MINT, last is BURN, returns correct `EmissionResult`, rolls back on ledger failure |
| `updateCommissionRate()` | Updates subsequent `calculate()` calls, throws on rate ≤ 0, throws on rate ≥ 1 |

---

## 5. Example: $10,000 Transaction

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

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split; verified by unit test
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero supply
4. `reserveIndex` is monotonically non-decreasing — only `sqrt` growth, never decreases; verified by unit test
5. All ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 7. Open Recommendations (Carry-Forward)

| Priority | Recommendation | Status |
|----------|---------------|--------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add `AfcReserveEntity` with periodic snapshots. | Open |
| MEDIUM | **Wire `mintForTransaction()` into ingestion pipeline** — replace any remaining `mint()` calls in bridge/ingestion path with the canonical entry point. | Open |
| LOW | **Sync epoch AFC to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; in-memory index and epoch-level reserve can diverge after restart. | Open |

---

## 8. Changes Made in This Pass

| File | Action |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — 22 unit tests covering full canonical emission surface |
| `AGENT_CORE_REPORT.md` | **Updated** — fresh re-audit, test coverage section, carry-forward recommendations |
