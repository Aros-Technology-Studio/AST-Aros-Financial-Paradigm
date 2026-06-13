# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-a35usb` (re-audit session; original implementation landed on `agent/core-emission` → merged PR #72)  
**Date:** 2026-06-13 (re-audit; prior audit: 2026-05-12)  
**Task:** Audit ArosCoin emission logic against the canonical model and confirm continued alignment

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

Module 01 is **NOT deprecated** as code — it is pure specification documentation.
The README marks it *"Deprecated"* only to indicate there is no executable code here;
the canonical source of truth lives in `src/token/`.

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Aligned | Canonical 1:1 formulas, AFC reserve index |
| `aro_emission_protocol.md` | ✅ Aligned | Full Mermaid lifecycle diagram, 75/25 split, burn flow |
| `payment_distribution.md` | ✅ Aligned | Canonical 75/25 table + per-node PoT-weight formula |
| `burn_and_mint_rules.md` | ✅ Aligned | Burn-on-withdrawal policy; no 1:1 conflicts |
| `README.md` | ✅ Aligned | Architecture overview; no formula conflicts |

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive
distribution. **No emission logic resides here.** Actual PoT code lives in
`src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code confirmed correct (2026-06-13)

| File | Verified |
|------|---------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — see Section 3 |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge back-compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a `@deprecated` no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies 75/25 split per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burned after TX completion | Yes | ✅ `BURN` ledger record for full `emissionAmount` in atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` (monotonically increasing) |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction — all four steps commit or all roll back |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

**Result: Code FULLY CONFORMS to canonical model. No rewrites required.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts:82`)

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL       (75%)
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE     (25%)
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
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
TX Amount      = 10,000
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (accumulates → drives price up)
Burn           = 10,000 ARO  (destroyed after TX completes)

Net circulating supply change = 0  (mint and burn cancel out)

After 12.50 ARO in AFC reserve:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced at this index
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on zero or negative input
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — grows only via `sqrt(totalReserve)`, never decremented
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Documentation Changes Made (Original Pass, 2026-05-12)

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow + Mermaid diagram |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split; added validator weight formula |

No documentation changes required in this re-audit (2026-06-13) — all files remain aligned.

---

## 7. Open Recommendations

| Priority | Item |
|----------|------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on process restart. Add an `AfcReserveEntity` table with periodic snapshots. |
| HIGH | **Wire `mintForTransaction()` into all ingestion paths** — replace remaining `mint()` calls in bridge/ingestion pipeline with the canonical entry point. |
| MEDIUM | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, `nodeShare + afcShare == commission` invariant. |
| MEDIUM | **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; in-memory index diverges after epoch finalization. |
| LOW | **Commission rate governance audit log** — `updateCommissionRate()` updates in-memory only; changes should be persisted and emitted as a governance event. |
