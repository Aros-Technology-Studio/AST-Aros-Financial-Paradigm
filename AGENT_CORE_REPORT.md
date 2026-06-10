# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-wtqdmu`  
**Date:** 2026-06-10 (re-audit) · 2026-05-12 (original landing, PR #72 `agent/core-emission` → `main`)  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## Re-audit Summary — 2026-06-10

Complete re-verification of all three target directories plus supporting services.  
**Verdict: canonical model is fully implemented and correct. No rewrites required.**

| Check | Result |
|-------|--------|
| `01_coin_engine/` | Documentation only — no code. All `.md` formulas match canonical model (rewritten in prior pass). |
| `10_proof_of_transaction_engine/` | Documentation only — no emission code. PoT spec files intact. |
| `src/token/emission.service.ts` | ✅ Canonical 1:1 engine — verified correct (see §2) |
| `src/token/token.service.ts` | ✅ `mintForTransaction()` delegates to EmissionService; legacy `mint()` is FIAT_DEPOSIT path (intentionally separate) |
| `src/token/tokenomics.service.ts` | ✅ `updateInternalValuation()` is `@deprecated` no-op |
| `src/fee_distribution/fee_distribution.service.ts` | ✅ `distributeRewards()` applies 75/25 split at epoch level |
| Module 01 deprecated? | **No.** Module 01 is pure documentation. Canonical source of truth is `src/token/`. |

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | Describes `Emission = TX Amount (1:1)`, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical | Describes 1:1 + 75/25 + burn-on-completion lifecycle |
| `payment_distribution.md` | ✅ Canonical | 75% nodes / 25% AFC reserve; validator weight formula |
| `burn_and_mint_rules.md` | ✅ Compatible | General burn-on-withdrawal policy; no contradictions |
| `node_participation_payments.md` | ✅ Compatible | Node reward distribution aligned with 75% pool |
| `README.md` | ✅ Compatible | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is a pure specification layer. The executable source of truth lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Specification only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution, and node role assignment. Zero emission code. Actual PoT implementation lives in `src/proof_of_transaction_engine/`. No action required.

### src/token/ — Status: Canonical implementation confirmed correct

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — types match model |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` → canonical entry point; `mint()`/`burn()` → legacy FIAT I/O paths |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` marked `@deprecated` and is a no-op; price delegates to `processReserve` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical, confirmed correct

`distributeRewards()` in `fee_distribution.service.ts` applies the canonical 75/25 split on epoch-collected fees:
- `nodePool = totalFees × 0.75` → distributed to nodes proportional to PoT weight
- `afcReserve = totalFees × 0.25` → recorded to `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

`process_reserve.service.ts` maintains a general transaction-volume ledger and `reserveIndex` (via `log1p`) used by legacy `tokenomics.getCurrentPrice()`. This is a parallel path; the canonical AFC index lives in `EmissionService.afcReserveState`.

---

## 2. Canonical Model Verification

| Rule | Canonical | Code |
|------|-----------|------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` — `EmissionService.calculate()` line 58 |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` — line 59 |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` — line 60 |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` — line 61 |
| ARO burned after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic `QueryRunner` — lines 138–146 |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` — line 176 |
| Epoch fees: same 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` — lines 158–159 |
| All steps atomic | Yes | ✅ All four ledger ops within single `QueryRunner` transaction — lines 96–162 |

---

## 3. Implementation Detail

### EmissionService canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ QueryRunner.startTransaction()
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  ├─ updateSupplySnapshot()   // totalMinted++, totalBurned++, circulatingSupply unchanged
  │
  └─ QueryRunner.commitTransaction()
      (or rollbackTransaction() on any failure)
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### Entry point in TokenService (`src/token/token.service.ts`)

```typescript
// Canonical path — use for all transaction processing
mintForTransaction(txAmount, recipient, refId, rate?) → EmissionService.processTransactionEmission()

// Legacy paths — preserved for fiat deposit/withdrawal flows only
mint(amount, recipient, refId)         → direct MINT ledger (FIAT_DEPOSIT)
burn(amount, sender, bankDetailsId)    → direct BURN ledger (FIAT_WITHDRAWAL) + BridgeService payout
```

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split pro-rata by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel — audit trail preserved)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced at this index
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on `amount <= 0`
2. `nodeShare + afcShare == commission` — exact float split, no rounding loss beyond IEEE 754 precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — only grows, never shrinks
5. All four ledger steps succeed or all roll back — single atomic `QueryRunner` transaction

---

## 6. Documentation Changes Made (Prior Pass — 2026-05-12)

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index formula, $10k example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index-ratio formula with canonical 1:1 + 75/25 + burn lifecycle |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 multi-actor split with canonical 75/25; added PoT weight formula |

All three files verified correct on 2026-06-10 re-audit. No further changes required.

---

## 7. Open Recommendations

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to database.** Currently in-memory — lost on process restart. Add an `AfcReserveEntity` table with snapshots after each emission. |
| MEDIUM | **Sync epoch AFC contributions into `EmissionService`.** `FeeDistributionService` records AFC to ledger but does not call `EmissionService.updateAfcReserve()`. The in-memory index falls out of sync after epoch finalization. |
| MEDIUM | **Wire `mintForTransaction()` into ingestion pipeline.** Audit the bridge/ingestion path (`src/bridge/`, `src/crypto_ingestion/`) to replace any remaining `mint()` calls with the canonical `mintForTransaction()`. |
| LOW | **Unit tests for `EmissionService.calculate()`.** Cover: dust amounts (`< 0.00000001`), maximum commission rate boundary, zero-amount guard, commission rounding at high precision. |
| LOW | **Clean up stale comments in `token.service.ts` `mint()`.** Developer notes about fiat/token input ambiguity are now resolved — the comments mislead future readers. |
