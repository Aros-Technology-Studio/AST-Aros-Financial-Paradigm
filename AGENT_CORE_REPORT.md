# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-09 (Pass 6 — prior passes: 2026-05-12, 2026-06-09×4, 2026-06-09)  
**Task:** Audit ArosCoin emission logic against the canonical model; verify all prior fixes; confirm correctness

---

## Summary of All Passes

| Pass | Date | Finding | Action |
|------|------|---------|--------|
| 1 | 2026-05-12 | Docs in `01_coin_engine/` diverged from canonical (wrong formulas) | Rewrote `coin_emission_model.md`, `aro_emission_protocol.md`, `payment_distribution.md` |
| 2 | 2026-06-09 | `calculateTotalFees()` summed wrong column (always 0); epoch double-counted AFC reserve; `burnAmount` balance deficit | Fixed `fee_distribution.service.ts`, added `burnAmount` to `EmissionResult`, moved AFC update post-commit |
| 3 | 2026-06-09 | 4-step emission lifecycle not truly atomic — each ledger call opened its own DB transaction | Fixed `LedgerService.recordTransaction()` + `EmissionService.processTransactionEmission()` |
| 4 | 2026-06-09 | Full re-audit confirms all prior fixes are correctly in place; no new canonical deviations found | Report updated with complete verification matrix |
| 5 | 2026-06-09 | Independent re-audit: all canonical invariants verified correct; `mint()` FIAT_DEPOSIT path confirmed canonical (75/25 split, AFC update, no burn — two-phase deposit lifecycle is correct) | Report updated; no code changes required |
| 6 | 2026-06-09 | Full code read of `emission.service.ts` and `emission.interfaces.ts`; all 6 canonical rules confirmed correct | Report updated with Pass 6 verification; no code changes required |

---

## Pass 5 — Independent Re-Audit (this run)

Full independent audit of all emission-related files. All canonical invariants verified as correctly implemented. No deviations from the canonical model found.

**Files audited:** `src/token/emission.service.ts`, `src/token/emission.interfaces.ts`, `src/token/token.service.ts`, `src/token/tokenomics.service.ts`, `src/proof_of_transaction_engine/process_reserve.service.ts`, `01_coin_engine/*.md`, `10_proof_of_transaction_engine/*.md`.

**Key observations:**
- `EmissionService.calculate()` computes `burnAmount = emissionAmount − commission` correctly, avoiding any ledger deficit (Pass 2 fix confirmed).
- All 4 ledger writes in `processTransactionEmission()` share `queryRunner.manager` — truly atomic (Pass 3 fix confirmed).
- AFC reserve updated AFTER `commitTransaction()` — in-memory state stays in sync with DB (Pass 3 fix confirmed).
- `mint()` FIAT_DEPOSIT path applies 75/25 commission split and calls `recordAfcContribution()` — canonical fee distribution respected even for deposits.
- `tokenomics.service.updateInternalValuation()` is a correctly marked no-op deprecated wrapper.
- `01_coin_engine/` and `10_proof_of_transaction_engine/` are documentation-only; no source code, not deprecated.

**No code changes made in this pass.**

---

## Pass 4 — Full Re-Audit (prior run)

All prior fixes (Passes 1–3) verified as correctly implemented. No new deviations from the canonical model found. The complete verification matrix is documented in Section 2 below.

Checked files: `src/token/emission.service.ts`, `src/token/emission.interfaces.ts`, `src/token/token.service.ts`, `src/token/token.controller.ts`, `src/token/tokenomics.service.ts`, `src/proof_of_transaction_engine/process_reserve.service.ts`, `01_coin_engine/*.md`.

---

## Pass 3 — Atomicity Fix

### Bug: emission lifecycle steps committed independently

**Symptom:** `processTransactionEmission()` held an outer `queryRunner` and called
`queryRunner.startTransaction()`, then delegated each ledger write to
`this.ledgerService.recordTransaction()`. That method opened its **own** `QueryRunner`
and **its own** `startTransaction()` / `commitTransaction()` internally. Each of the
4 steps (MINT, FEE×2, BURN) committed immediately and independently.

**Consequence:** if step 3 or 4 failed after earlier steps had already committed, the
ledger was left in a broken partial state — e.g. ARO minted to the recipient but never
burned, or commission only partially recorded. The outer `rollbackTransaction()` only
undid the `SupplySnapshot` write; it could not undo the already-committed ledger rows.

### Fix — two files changed

**`src/ledger/ledger.service.ts`**

Added an optional `manager?: EntityManager` parameter to `recordTransaction()`.

- When `manager` is supplied: delegates to a new private `writeWithManager()` helper
  that writes directly into the caller's `EntityManager`. No new `QueryRunner`, no
  `startTransaction`, no `commit` or `rollback` here.  
- When `manager` is omitted: original standalone behaviour is preserved — own
  `QueryRunner`, own transaction. All existing callers outside `EmissionService` are
  unaffected.

**`src/token/emission.service.ts`**

All 4 `ledgerService.recordTransaction()` calls now pass `queryRunner.manager` as the
second argument. The outer `queryRunner` transaction now atomically wraps all of:

1. MINT emissionAmount ARO → recipient
2. FEE_DISTRIBUTION nodeShare (75%) → node pool
3. FEE_DISTRIBUTION afcShare (25%) → AFC reserve
4. BURN burnAmount → burn vault
5. `SupplySnapshot` update

A failure at any step rolls back the entire set.

---

## Pass 6 — Full Code Verification (this run)

Full re-read of `src/token/emission.service.ts` (231 lines) and `src/token/emission.interfaces.ts`.

**Canonical rules verified against actual code:**

| Rule | Code location | Confirmed |
|------|---------------|-----------|
| Emission = txAmount (1:1) | `emission.service.ts:58` — `const emission = transactionAmount` | ✅ |
| Fee = txAmount × rate (0.5%) | `emission.service.ts:59` — `const commission = transactionAmount * rate` | ✅ |
| 75% → nodes | `emission.service.ts:60` — `commission * this.config.nodeShareRatio` (0.75) | ✅ |
| 25% → AFC reserve | `emission.service.ts:61` — `commission * this.config.afcReserveRatio` (0.25) | ✅ |
| ARO burn after TX | `emission.service.ts:138-146` — `TransactionType.BURN` ledger record | ✅ |
| AFC reserve → price rises | `emission.service.ts:175-176` — `1.0 + sqrt(totalReserve) / 10_000` | ✅ |

**No code changes made in Pass 6.** All canonical invariants verified as correctly implemented.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated) ✅

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, 75/25 split, $10,000 example |
| `aro_emission_protocol.md` | ✅ Canonical emit → fee_split → burn lifecycle with mermaid diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split, PoT validator weight formula |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation.  
Source-of-truth code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only, no emission code

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical, atomicity bug fixed ✅

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult` (with `burnAmount`, `mintTxHash?`), `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ **Fixed (Pass 3)** — 4-step lifecycle now truly atomic via shared `EntityManager` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; price comes from reserve index |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Two bugs fixed in Pass 2 ✅

| Fix | Detail |
|-----|--------|
| `calculateTotalFees()` | Now queries `SUM(tx.amount)` on `FEE_DISTRIBUTION` rows; previously summed `tx.fee` which is always 0 |
| `distributeRewards()` | Removed double-AFC recording; distributes node pool 100% to validators by PoT weight |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN burnAmount` (= emissionAmount − commission) — avoids ledger deficit |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` (updated post-commit) |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| All steps atomic | **Required** | ✅ **Fixed (Pass 3)** — shared `EntityManager` across all 5 writes |

---

## 3. Corrected Emission Lifecycle

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():                               (pure, no side effects)
  │    emissionAmount = txAmount                // 1:1
  │    commission     = txAmount × rate         // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │    burnAmount     = emissionAmount − commission  // recipient's actual balance
  │
  ├─ queryRunner.startTransaction()             ← outer atomic boundary opens
  │    ├─ Ledger MINT       emissionAmount → recipient      (mgr passed)
  │    ├─ Ledger FEE_DIST   nodeShare      → NODE_POOL      (mgr passed)
  │    ├─ Ledger FEE_DIST   afcShare       → AFC_RESERVE    (mgr passed)
  │    ├─ Ledger BURN       burnAmount     → BURN_VAULT     (mgr passed)
  │    └─ SupplySnapshot saved                              (mgr via runner)
  ├─ queryRunner.commitTransaction()            ← atomic boundary closes
  └─ updateAfcReserve(afcShare)                 ← in-memory only; after commit
```

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           =  9,950 ARO  (= emissionAmount − commission; recipient's net balance)
Net circulating change = +50 ARO (commission stays in circulation)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced marginally higher
```

---

## 5. System Addresses

| Constant | Value |
|----------|-------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding leakage
3. `totalMinted - totalBurned == commission × txCount` in `SupplySnapshot` — only commission stays in circulation
4. `reserveIndex` is monotonically non-decreasing — updated only post-commit, never on failure
5. All 5 emission writes succeed or all roll back — guaranteed by shared `EntityManager` (fixed Pass 3)

---

## 7. Open Recommendations

| Priority | Item |
|----------|------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; state lost on restart. Add an `AfcReserveEntity` table; reload `totalReserve` on service init. |
| Medium | **Wire `mintForTransaction()` into all ingestion paths** — replace residual `mint()` calls in bridge/ingestion with the canonical entry point. |
| Medium | **Epoch AFC sync** — `FeeDistributionService` writes AFC reserve to ledger but does not call `EmissionService.recordAfcContribution()`; in-memory `reserveIndex` drifts from ledger after epoch finalization. |
| Low | **Nonce collision under concurrency** — steps 2a, 2b, 4 share `sender = recipientAddress` with nonces `base+1..+3`; two concurrent emissions for the same recipient within 1 ms collide on `(sender, nonce)` unique index. Use a per-address monotonic sequence or a UUID-derived nonce. |
| Low | **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard, and `burnAmount + commission == emissionAmount` assertion. |
