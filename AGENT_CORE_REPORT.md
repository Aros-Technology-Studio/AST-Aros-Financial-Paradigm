# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-Q0j33`  
**Date:** 2026-06-03  
**Task:** Audit ArosCoin emission logic against the canonical 1:1 model; rewrite if divergent

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | Current state |
|------|--------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical formulas, Mermaid sequence diagram, allocation flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split, PoT-normalized sub-distribution |
| `burn_and_mint_rules.md` | ✅ Non-contradictory general policy |
| `README.md` | ✅ Architecture overview, no formula conflicts |

Module 01 is **not deprecated** — it is pure documentation. The source-of-truth implementation lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution. Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic present here.

### src/token/ — Status: Canonical code verified correct

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — see §2 |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge/fiat flow |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` reads ProcessReserve index |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code verified correct

| File | Status |
|------|--------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Canonical 75/25 split applied at epoch level |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code verdict |
|------|-----------|--------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (configurable via governance) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` applies identical split |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction with rollback on any failure |

**All canonical rules are satisfied. No rewrites required.**

---

## 3. Implementation Detail

### EmissionService canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1, no multiplier
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot():
       totalMinted   += emissionAmount
       totalBurned   += emissionAmount
       circulatingSupply unchanged (net zero)
```

All five steps execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Worked Example — $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight across active validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel in same atomic TX)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000354...
  → every subsequent emission is priced slightly higher
```

---

## 5. Invariants (enforced in code)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws on `amount ≤ 0`
2. `nodeShare + afcShare == commission` — exact float split, no rounding loss beyond 8 d.p.
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing — only grows as reserve accumulates
5. All ledger steps succeed or all roll back — single `QueryRunner` with `rollbackTransaction()` on error

---

## 6. Open Gaps (non-blocking, tracked for future work)

| # | Gap | Severity | Location |
|---|-----|----------|----------|
| 1 | `AfcReserveState` is in-memory — lost on process restart | Medium | `EmissionService` |
| 2 | Legacy `mint()` in `TokenService` bypasses canonical emission path (no fee split, no burn, no AFC update) — used by bridge/fiat flow | Medium | `token.service.ts:79` |
| 3 | `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does NOT call `EmissionService.updateAfcReserve()` — epoch fees don't update in-memory `reserveIndex` | Low | `fee_distribution.service.ts:167` |
| 4 | `TokenomicsService.getCurrentPrice()` reads `ProcessReserveLedgerService.reserveIndex` (log1p-based), not `EmissionService.getCurrentEmissionPrice()` (sqrt-based) — two separate price indices can diverge | Low | `tokenomics.service.ts:42` |
| 5 | No unit tests covering `EmissionService.calculate()` edge cases (dust amounts, max rate, zero-amount guard) | Low | `src/token/` |

---

## 7. Prior Audit History

| Date | Branch | Summary |
|------|--------|---------|
| 2026-05-12 | `claude/inspiring-cannon-4qbjK` | First canonical alignment pass — `emission.service.ts` written, docs in 01_coin_engine rewritten from divergent formulas |
| 2026-06-03 | `claude/inspiring-cannon-Q0j33` | Verification pass — all code confirmed canonical, no changes required to emission logic, report updated |
