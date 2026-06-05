# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

---

## Tenth Audit — 2026-06-05 (`agent/core-emission`) — AGENT-CORE

**Scope:** `01_coin_engine/`, `10_proof_of_transaction_engine/`, `src/token/`
**Result:** Full independent re-audit from clean checkout. All canonical invariants confirmed correct. No new deviations found.

### Files verified

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult` includes `burnAmount` and optional `mintTxHash` |
| `emission.service.ts` | ✅ `burnAmount = emissionAmount − commission`; Step 4 BURN uses `burnAmount`; `recordAfcContribution()` present; `mintTxHash` returned |
| `token.service.ts` | ✅ `@deprecated` on legacy `mint()` / `burn()`; `TokenomicsService` removed from DI; no stale comments |

### Canonical model verification

| Rule | Code location | Status |
|------|--------------|--------|
| `emission = transactionAmount` (1:1) | `emission.service.ts:58` | ✅ |
| `commission = transactionAmount × 0.5%` | `emission.service.ts:59` | ✅ |
| `nodeShare = commission × 0.75` | `emission.service.ts:60` | ✅ |
| `afcShare = commission × 0.25` | `emission.service.ts:61` | ✅ |
| `burnAmount = emissionAmount − commission` | `emission.service.ts:64` | ✅ |
| MINT → FEE×2 → AFC update → BURN (atomic) | `emission.service.ts:103–162` | ✅ |
| `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | `emission.service.ts:179–180` | ✅ |
| External AFC sync via `recordAfcContribution()` | `emission.service.ts:192–196` | ✅ |
| Epoch AFC syncs `reserveIndex` | `fee_distribution.service.ts` | ✅ `this.emissionService.recordAfcContribution(afcReserve)` |

### $10,000 transaction example (verified)

```
txAmount   = 10,000
emission   = 10,000 ARO  minted to recipient    (1:1)
commission =     50 ARO  (0.5%)
  nodeShare=  37.50 ARO → NODE_POOL             (75%)
  afcShare =  12.50 ARO → AFC_RESERVE           (25%)
burnAmount =  9,950 ARO  burned

Net supply Δ = +50 ARO (commission stays in node pool / AFC reserve)
reserveIndex = 1.0 + sqrt(12.50) / 10,000 ≈ 1.0000353
```

**Module 01 (`01_coin_engine/`) status:** Active specification documentation — NOT deprecated. Implementation source of truth: `src/token/emission.service.ts`.

---

## Ninth Audit — 2026-06-05 (`agent/core-emission`) — AGENT-CORE

**Scope:** `01_coin_engine/`, `10_proof_of_transaction_engine/`, `src/token/`
**Result:** One remaining deviation confirmed fixed in prior pass; one stale comment block cleaned up. All canonical invariants pass.

### Summary of state found

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `burnAmount` + optional `mintTxHash` present |
| `emission.service.ts` | ✅ `calculate()` returns `burnAmount = emissionAmount − commission`; BURN step uses `burnAmount`; supply snapshot updated correctly; `mintTxHash` returned |
| `token.service.ts` | ✅ Fixed — removed stale `// [NEW]` annotation and multi-line deliberation comment from `burn()` |
| `token.service.spec.ts` | ✅ Correct — `mintForTransaction` test validates `mintTxHash`; mock aligned |
| `emission.service.spec.ts` | ✅ Correct — tests verify `burnAmount = 9,950` for a $10,000 TX |

### Key invariant confirmed

```
emissionAmount (10,000) = burnAmount (9,950) + commission (50)
totalMinted   += emissionAmount   (10,000)  — full issue for audit
totalBurned   += burnAmount       (9,950)   — net destruction after fees paid
circulatingSupply += commission    (50)     — fees remain in node pool / AFC reserve
```

Burning `emissionAmount` instead of `burnAmount` would create a ledger deficit equal to `commission` — the bug prior audits targeted. Implementation now matches spec tests exactly.

---

## Eighth Audit — 2026-06-04 (`agent/core-emission`) — AGENT-CORE

**Scope:** `01_coin_engine/`, `10_proof_of_transaction_engine/`, `src/token/`  
**Result:** Two remaining deviations found and fixed. All canonical invariants now pass.

| Fix | File | Status |
|-----|------|--------|
| `burn()` erroneously called `processReserve.recordTransactionVolume()` | `token.service.ts:168-170` | **Fixed** |
| `TokenomicsService` removed from module but still injected in `TokenService` (DI break) | `token.service.ts:30, token.service.spec.ts` | **Fixed** |

See **Section 3** for full details.

---

## Seventh Audit — 2026-06-04 (`agent/core-emission`) — AGENT-CORE

**Scope:** `01_coin_engine/`, `10_proof_of_transaction_engine/`, `src/token/`  
**Result:** Full independent re-audit. All canonical invariants pass. Remote branch already had `@deprecated` on legacy `mint()` and `burn()`. No additional code changes required in this pass.

| Rule | Code Location | Status |
|------|--------------|--------|
| `emission = transactionAmount` (1:1) | `emission.service.ts:58` | ✅ |
| `commission = transactionAmount × 0.5%` | `emission.service.ts:59` | ✅ |
| `nodeShare = commission × 0.75` | `emission.service.ts:60` | ✅ |
| `afcShare = commission × 0.25` | `emission.service.ts:61` | ✅ |
| MINT → FEE×2 → AFC update → BURN (atomic) | `emission.service.ts:100–161` | ✅ |
| `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | `emission.service.ts:175–176` | ✅ |
| Legacy `mint()` / `burn()` clearly `@deprecated` | `token.service.ts:76, 130` | ✅ |

**Module 01 status:** Active documentation — NOT deprecated. Canonical implementation: `src/token/emission.service.ts`.

---

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-05  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — NOT deprecated (documentation only)

| File | State |
|------|-------|
| `coin_emission_model.md` | Canonical 1:1 formulas ✅ |
| `aro_emission_protocol.md` | Canonical 1:1 + 75/25 + burn flow ✅ |
| `payment_distribution.md` | Canonical 75/25 split ✅ |
| `burn_and_mint_rules.md` | Correct burn-on-withdrawal policy ✅ |

Source code lives in `src/token/` — Module 01 is the specification, not the implementation.

### 10_proof_of_transaction_engine — PoT validation only

Contains spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status after this audit pass

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Correct — `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Correct — full canonical 1:1 lifecycle; `recordAfcContribution()` public |
| `token.service.ts` | ✅ Fixed — removed `TokenomicsService` dep + `burn()` cleanup |
| `tokenomics.service.ts` | ✅ Correct — `getCurrentPrice()` → `EmissionService.getCurrentEmissionPrice()` |
| `token.module.ts` | ✅ Correct — `TokenomicsService` removed from providers (consistent with service) |
| `token.service.spec.ts` | ✅ Fixed — removed orphaned `TokenomicsService` mock |

### src/fee_distribution/ — Canonical, epoch sync fixed

`FeeDistributionService.distributeRewards()` applies 75/25 split and calls `emissionService.recordAfcContribution(afcReserve)` after the on-chain AFC record, keeping `reserveIndex` accurate across both per-TX and per-epoch flows ✅

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` (`EmissionService.calculate()`) |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ BURN ledger record in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC syncs reserveIndex | Yes | ✅ `emissionService.recordAfcContribution()` after on-chain record |
| Price source unified | Yes | ✅ All callers → `EmissionService.getCurrentEmissionPrice()` |

---

## 3. Deviations Fixed (Eighth Audit, 2026-06-04)

### Fix 1 — `TokenService.burn()` erroneously recorded transaction volume

**File:** `src/token/token.service.ts:168-171`

**Problem:**
```typescript
// BEFORE (wrong)
this.processReserve.recordTransactionVolume(parseFloat(amount));
this.tokenomicsService.updateInternalValuation();
return { ..., message: `Tokens burned at Price ${this.tokenomicsService.getCurrentPrice()}...` };
```
Burning ARO is the final step of the canonical emission lifecycle — it is not a new economic event. Recording the burned amount as fresh processing volume double-counted the economic event and inflated `ProcessReserveLedger.totalProcessVolume`. The `updateInternalValuation()` was a no-op (deprecated). The price in the return message was misleading noise.

**Fix:** Removed all three lines. Bridge payout response is now clean.

---

### Fix 2 — `TokenomicsService` injected in `TokenService` after being removed from module

**Files:** `src/token/token.service.ts:10,30`, `src/token/token.service.spec.ts:12,93`

**Problem:**  
A previous pass removed `TokenomicsService` from `token.module.ts` providers (correct, since pricing now flows through `EmissionService`). But `TokenService` still declared `tokenomicsService: TokenomicsService` in its constructor — a broken DI reference. The spec also mocked it as a provider unnecessarily.

**Fix:** Removed `TokenomicsService` import and constructor parameter from `TokenService`. Removed corresponding mock from spec.

---

## 4. Canonical Emission Lifecycle

```
TokenService.mintForTransaction(txAmount, recipient, refId, rate?)
      │
      ▼
EmissionService.processTransactionEmission()
      │
      ├─ [1] MINT  ─────────────────────► recipient        (+emissionAmount ARO, 1:1)
      │
      ├─ [2a] FEE_DISTRIBUTION (75%) ───► NODE_POOL        (+nodeShare ARO)
      │
      ├─ [2b] FEE_DISTRIBUTION (25%) ───► AFC_RESERVE      (+afcShare ARO)
      │
      ├─ [3] updateAfcReserve()
      │       totalReserve += afcShare
      │       reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
      │       ▲ SINGLE canonical price source
      │         TokenomicsService.getCurrentPrice() → EmissionService.getCurrentEmissionPrice()
      │
      ├─ [4] BURN ──────────────────────► BURN_VAULT       (−burnAmount ARO)
      │         where burnAmount = emissionAmount − commission
      │
      └─ [5] SUPPLY_SNAPSHOT
              circulatingSupply += commission   (fees stay circulating in node pool / AFC)
              totalMinted:       +emissionAmount  (audit)
              totalBurned:       +burnAmount      (audit)

All 5 steps execute atomically in a single QueryRunner transaction.
```

### Epoch-level AFC sync (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.recordAfcContribution(afcReserve)  ← syncs reserveIndex
  │
  └─ for each node: Ledger VALIDATOR_REWARD → nodeId (proportional to PoT weight)
```

---

## 5. Example: $10,000 Transaction

```
TX Amount   = 10,000 ARO
Emission    = 10,000 ARO  (1:1 mint → recipient)
Commission  = 10,000 × 0.005 = 50 ARO
  Node pool = 50 × 0.75 = 37.50 ARO  (epoch-distributed by PoT weight)
  AFC       = 50 × 0.25 = 12.50 ARO  (locked in reserve)
burnAmount  =  9,950 ARO  (emissionAmount − commission; destroyed after TX)

circulatingSupply Δ = +50 ARO (commission stays active in node pool / AFC reserve)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.00003536…
  → every subsequent emission is priced slightly higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss
3. `burnAmount = emissionAmount − commission` — recipient burns only what remains after fee payment
4. `reserveIndex` is monotonically non-decreasing (per-TX and per-epoch contributions both apply)
5. All 5 ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Changed Files

| Audit | File | Change |
|-------|------|--------|
| 8th | `src/token/token.service.ts` | Removed `TokenomicsService` dep; removed erroneous `recordTransactionVolume()` and `updateInternalValuation()` from `burn()` |
| 8th | `src/token/token.service.spec.ts` | Removed orphaned `TokenomicsService` import and mock provider |
| Prior | `src/fee_distribution/fee_distribution.service.ts` | Injects `EmissionService`; calls `recordAfcContribution()` after epoch AFC on-chain record |
| Prior | `src/token/emission.service.ts` | `recordAfcContribution()` public method added |
| Prior | `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas |
| Prior | `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical flow |
| Prior | `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with 75/25 split |

---

## 8. Recommendations (carried forward)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table or rehydrate from ledger history on boot.
- **Wire `mintForTransaction()` throughout ingestion pipeline** — replace all remaining `mint()` calls with the canonical entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard.
- **Sync epoch AFC contribution to `EmissionService`** — ✅ Done via `recordAfcContribution()` in `FeeDistributionService`.
