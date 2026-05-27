# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-4qbjK` (canonical emission originally landed in `agent/core-emission` → merged PR #72)  
**Date:** 2026-05-12  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Pre-patch content | Action taken |
|------|------------------|--------------|
| `coin_emission_model.md` | Described `E = F / N` (fee ÷ nodes) — diverged from canonical 1:1 | **Rewritten** to canonical model |
| `aro_emission_protocol.md` | `EMISSION_AMOUNT = Σ(load × index × ratio)` — diverged | **Rewritten** to canonical formulas |
| `payment_distribution.md` | 60/15/15/5/5 multi-actor split — diverged from canonical 75/25 | **Rewritten** to 75/25 |
| `burn_and_mint_rules.md` | Correct general burn-on-withdrawal policy; no 1:1 mention | Left as-is (non-contradictory) |
| `README.md` | Architecture overview; no formula conflicts | Left as-is |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
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

## 6. Documentation Changes Made in This Pass

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split; added validator weight formula |

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add a `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.

---

## 8. AUDIT UPDATE — 2026-05-27 (AGENT-CORE Re-verification)

**Branch:** `claude/inspiring-cannon-MZhep`

### 8.1 Re-audit Scope

Full re-verification of canonical 1:1 emission model across all emission-related files after previous audit pass (2026-05-12).

### 8.2 Findings

| Component | Status | Notes |
|-----------|--------|-------|
| `src/token/emission.service.ts` | ✅ **CANONICAL — CORRECT** | 1:1 emission, 75/25 split, atomic burn, AFC index all verified |
| `src/token/emission.interfaces.ts` | ✅ **CORRECT** | All types match canonical model |
| `src/token/token.service.ts::mintForTransaction()` | ✅ **CANONICAL** | Delegates to EmissionService correctly |
| `src/token/token.service.ts::mint()` | ⚠️ **LEGACY (non-canonical)** | FIAT_DEPOSIT path — mints without atomic burn. Added `@deprecated` JSDoc and warning log. |
| `src/token/token.service.ts::burn()` | ⚠️ **LEGACY (non-canonical)** | FIAT_WITHDRAWAL path — separate burn without canonical lifecycle. Added `@deprecated` JSDoc. |
| `src/token/tokenomics.service.ts` | ✅ **CORRECT** | `updateInternalValuation()` already deprecated no-op |
| `01_coin_engine/aro_emission_protocol.md` | ✅ **MATCHES CODE** | Matches `emission.service.ts` formula exactly |
| `10_proof_of_transaction_engine/` | ✅ **COMPATIBLE** | PoT handles downstream distribution; no conflict |

### 8.3 Actions Taken

1. **Updated `token.service.ts`** — Added explicit `@deprecated` annotations and `warn`-level log calls to legacy `mint()` and `burn()` methods. These methods remain for backward-compatibility with the fiat bridge but are now clearly marked as non-canonical.

2. **AGENT_CORE_REPORT.md updated** — This section added as addendum to original report.

### 8.4 Canonical Model Verification (2026-05-27)

```
Emission     = Transaction Amount           ✅ emissionAmount = transactionAmount
Commission   = TX Amount × 0.005            ✅ commission = transactionAmount * rate
Node Share   = Commission × 0.75            ✅ nodeShare = commission * 0.75
AFC Reserve  = Commission × 0.25            ✅ afcShare = commission * 0.25
Burn         = emissionAmount (atomic)      ✅ BURN step in same QueryRunner TX
AFC Index    = 1.0 + sqrt(reserve)/10000   ✅ reserveIndex formula confirmed
Net Supply Δ = 0                            ✅ mint + burn cancel in SupplySnapshot
```

### 8.5 Verdict

**Canonical 1:1 emission model is CORRECTLY IMPLEMENTED in `src/token/emission.service.ts`.**  
No regressions found. Legacy fiat-bridge methods now carry explicit non-canonical warnings.

---

*Re-audit by AGENT-CORE — 2026-05-27*  
*Commit: `feat: canonical 1:1 emission model implementation`*
