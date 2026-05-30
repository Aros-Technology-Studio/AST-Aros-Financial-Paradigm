# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-FHK9a`  
**Date:** 2026-05-30  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or rewrite; deliver tests and report

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | Describes 1:1 emission, 75/25 split, AFC reserve index formula |
| `aro_emission_protocol.md` | ✅ Canonical | Full Mermaid lifecycle diagram, formulas, system addresses |
| `payment_distribution.md` | ✅ Canonical | 75/25 split; historical note on obsolete 60/15/15/5/5 table |
| `burn_and_mint_rules.md` | ✅ No conflicts | General burn rules, compatible with canonical model |
| `burn_mechanism.md` | ✅ No conflicts | — |
| `README.md` | ✅ No conflicts | Architecture overview, no formula divergence |

**Module 01 is NOT deprecated.** It is pure documentation. Source of truth for code is `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Live PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in this module.

### src/token/ — Status: Canonical (with one gap fixed in this pass)

| File | Status | Action |
|------|--------|--------|
| `emission.interfaces.ts` | ✅ Correct | `EmissionResult`, `EmissionConfig`, `AfcReserveState` match canonical model |
| `emission.service.ts` | ✅ Canonical | Full 1:1 lifecycle — mint → node fee → AFC fee → burn (atomic) |
| `token.service.ts` | ✅ Correct | `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat bridge |
| `tokenomics.service.ts` | ✅ Correct | `updateInternalValuation()` deprecated no-op; `getCurrentPrice()` compat layer |
| `token.module.ts` | ✅ Correct | `EmissionService` registered and exported |
| `token.controller.ts` | ⚠️ Gap → **Fixed** | `POST /emit` and `GET /emission/price` added (see §3) |
| `emission.service.spec.ts` | ⚠️ Missing → **Created** | Full unit test suite for `EmissionService` (see §4) |

### src/fee_distribution/ — Status: Canonical

`FeeDistributionService.distributeRewards()` applies the canonical 75/25 split at epoch finalization — correct.

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

`ProcessReserveLedgerService` tracks general process volume (legacy; `log1p` index). This is a separate tracker from the canonical AFC reserve in `EmissionService` (`sqrt/10_000`). The two coexist without conflict: `ProcessReserveLedgerService` is used by legacy `mint()`/`burn()` callers; `EmissionService` is the canonical source.

`PoTService` — scoring and weight normalization correct and untouched.

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|------------|
| Emission = TX Amount (1:1) | ✅ | `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate (default 0.5%) | ✅ | `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | ✅ | `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | ✅ | `afcShare = commission * 0.25` |
| ARO burned after TX completes | ✅ | `BURN` ledger record for `emissionAmount` in same atomic transaction |
| AFC reserve grows → price rises | ✅ | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | ✅ | `FeeDistributionService.distributeRewards()` |
| Canonical HTTP endpoint exists | ✅ (fixed) | `POST /api/v1/token/emit` added in this pass |
| `EmissionService` unit tests | ✅ (fixed) | `emission.service.spec.ts` created in this pass |

---

## 3. Implementation Detail

### EmissionService lifecycle (`src/token/emission.service.ts`)

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL_00000000000000000000
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE_000000000000000000
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT_00000000000000000000
  └─ updateSupplySnapshot():
       totalMinted += emissionAmount
       totalBurned += emissionAmount
       circulatingSupply unchanged (net zero)
```

All four ledger operations execute atomically within a single `QueryRunner` transaction. Any failure rolls back all steps.

### New HTTP endpoints (`src/token/token.controller.ts`)

```
POST /api/v1/token/emit
Body: { transactionAmount, recipient, referenceId, commissionRate? }
Returns: { status, referenceId, emissionAmount, commission, nodeShare, afcReserveShare, emissionPrice }

GET /api/v1/token/emission/price
Returns: { reserveState: AfcReserveState, emissionPrice: number }
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

## 5. Test Coverage Added (`src/token/emission.service.spec.ts`)

| Suite | Tests |
|-------|-------|
| `calculate()` | 1:1 emission; 0.5% default commission; 75/25 split; custom rate; dust amount; zero guard; negative guard |
| `processTransactionEmission()` | 4 ledger calls in canonical order; correct amounts; rollback on ledger error |
| AFC reserve price index | starts at 1.0; grows monotonically; matches `sqrt` formula exactly |
| `updateCommissionRate()` | valid rate accepted; rate=0 throws; rate≥1 throws |

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (accumulates, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 7. Remaining Recommendations (not blocking)

| Item | Priority | Description |
|------|----------|-------------|
| Persist `AfcReserveState` | Medium | Currently in-memory; lost on restart. Add `AfcReserveEntity` table with periodic snapshots. |
| Wire bridge path to canonical flow | Medium | `POST /api/v1/token/mint` (legacy) doesn't apply the canonical 75/25 fee split. Fiat deposit path should call `mintForTransaction()` instead of `mint()` once AFC accounting is required for bridge transactions. |
| Sync epoch AFC to `EmissionService` | Low | `FeeDistributionService` writes AFC reserve on ledger but doesn't call `EmissionService.updateAfcReserve()`; in-memory price index won't reflect epoch contributions. |
| Remove `ProcessReserveLedgerService` price path | Low | `TokenomicsService.getCurrentPrice()` reads `ProcessReserveLedgerService.reserveIndex` (log1p). Prefer `EmissionService.getCurrentEmissionPrice()` (sqrt, canonical) everywhere. |
