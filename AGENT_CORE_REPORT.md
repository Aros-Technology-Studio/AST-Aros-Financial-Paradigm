# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

> **Audit Pass 2 — 2026-06-13** (`claude/inspiring-cannon-yh09wf`)
> Findings: `emission.service.ts` matches canonical model ✅. Controller missing canonical `/emit` endpoint — **fixed**. Legacy `mint()` missing `fee` field — **fixed**. Tests added for `mintForTransaction()`.

---

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

## Audit Pass 2 — 2026-06-13

**Branch:** `claude/inspiring-cannon-yh09wf`

### Re-audit Scope

Full re-read of `01_coin_engine/`, `10_proof_of_transaction_engine/`, `src/token/`, `src/proof_of_transaction_engine/`.

### Confirmed Correct (no changes needed)

- `src/token/emission.service.ts` — canonical 1:1 model fully implemented:
  - `emission = transactionAmount` (1:1) ✅
  - `commission = transactionAmount × 0.005` ✅
  - `nodeShare = commission × 0.75` ✅
  - `afcShare = commission × 0.25` ✅
  - Atomic 4-step lifecycle: MINT → FEE_NODE → FEE_AFC → BURN ✅
  - `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` ✅
  - Net circulating supply change = 0 per canonical TX ✅
- `src/token/emission.interfaces.ts` — `EmissionResult`, `EmissionConfig`, `AfcReserveState` correct ✅
- `src/token/token.service.ts` — `mintForTransaction()` correctly delegates to `EmissionService` ✅
- `01_coin_engine/coin_emission_model.md` — matches canonical model (updated in pass 1) ✅

### Gaps Fixed in This Pass

**Gap 1 — CRITICAL: No HTTP endpoint for canonical emission**

`token.controller.ts` only exposed `POST /api/v1/token/mint` → legacy FIAT `mint()`. The canonical `mintForTransaction()` was unreachable via HTTP.

Fixed: Added `POST /api/v1/token/emit`:
```
POST /api/v1/token/emit
Body: { transactionAmount: number, recipient: string, referenceId: string, commissionRate?: number }
Returns: EmissionResult
```

**Gap 2 — MINOR: Missing `fee` field in legacy FIAT `mint()`**

`token.service.ts:mint()` called `ledgerService.recordTransaction()` without the `fee` field. Added `fee: '0'`.

**Gap 3 — No test coverage for canonical emission path**

Added three tests to `token.service.spec.ts` under `mintForTransaction`:
- Happy path — delegates to `EmissionService.processTransactionEmission()`
- Rejects zero/negative amounts
- Forwards optional `commissionRate`

### Two Distinct Mint Paths (By Design)

| Path | Method | ARO fate |
|------|--------|----------|
| Canonical network TX | `mintForTransaction()` → `EmissionService` | Transient — burned after TX, net supply Δ = 0 |
| FIAT deposit | `mint()` | Persistent — held in user wallet |

The FIAT deposit path does not follow the canonical burn model intentionally. When a user deposits fiat, the ARO they receive persist until withdrawal.

### Reserve Index Dualism

| Reserve | Source | Formula |
|---------|--------|---------|
| AFC Reserve (emission price) | `EmissionService.afcReserveState` | `1.0 + sqrt(total) / 10_000` |
| Process Reserve (PoT work) | `ProcessReserveLedgerService.reserveState` | `1.0 + log1p(total) / 100` |

`TokenomicsService.getCurrentPrice()` returns Process Reserve index (used only for legacy mint logging). For canonical emission pricing use `EmissionService.getCurrentEmissionPrice()`.

### Files Changed in This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` → `mintForTransaction()` |
| `src/token/token.service.ts` | Added `fee: '0'` to FIAT `mint()` ledger call |
| `src/token/token.service.spec.ts` | Added 3 tests for `mintForTransaction()` |
| `AGENT_CORE_REPORT.md` | This section |
