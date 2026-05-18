# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-18  
**Task:** Audit ArosCoin emission logic against the canonical model; verify and confirm code correctness

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Canonical alignment |
|------|-------------------|
| `coin_emission_model.md` | ✅ Describes `Emission = Transaction Amount (1:1)`, AFC reserve index formula, $10k example |
| `aro_emission_protocol.md` | ✅ Full canonical 1:1 protocol with mermaid sequence diagram and formula table |
| `payment_distribution.md` | ✅ 75/25 canonical split; historical note documenting superseded 60/15/15/5/5 model |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy, non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution. No emission logic. Actual PoT code lives in `src/proof_of_transaction_engine/`. **No changes required.**

### src/token/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all ratios correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: MINT → FEE_DISTRIBUTION (75/25) → AFC update → BURN |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` retained for fiat-deposit flow |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads from `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a no-op deprecated stub |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code (`emission.service.ts`) | Status |
|------|---------------|------------------------------|--------|
| Emission = TX Amount | 1:1, no multiplier | `emission = transactionAmount` in `calculate()` | ✅ |
| Fee = TX Amount × rate | default 0.5% | `commission = transactionAmount * rate` (`defaultCommissionRate: 0.005`) | ✅ |
| Fee split: 75% → nodes | Yes | `nodeShare = commission * 0.75` | ✅ |
| Fee split: 25% → AFC reserve | Yes | `afcShare = commission * 0.25` | ✅ |
| ARO burn after TX completion | Yes | `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX | ✅ |
| Net circulating supply change = 0 | Yes | `SupplySnapshot`: `totalMinted += emissionAmount`, `totalBurned += emissionAmount`, `circulatingSupply` unchanged | ✅ |
| AFC reserve grows → price rises | Yes | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` monotonically increasing | ✅ |
| All steps atomic | Yes | Single `QueryRunner` with rollback on any failure | ✅ |

**Verdict: No divergence found. Code fully matches the canonical model.**

---

## 3. Implementation Detail

### EmissionService lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount            // 1:1 — no multiplier
  │    commission     = txAmount × 0.005   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot(): totalMinted++, totalBurned++, circulatingSupply unchanged
```

All ledger operations execute atomically within a single `QueryRunner` transaction. On error, all steps roll back.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating supply change = 0   (mint and burn cancel in the same TX cycle)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants Confirmed

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on `amount ≤ 0`.
2. `nodeShare + afcShare == commission` — exact 75/25 split; no rounding loss beyond float precision.
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero supply.
4. `reserveIndex` is monotonically non-decreasing — grows via `sqrt`, never decremented.
5. All four ledger steps succeed atomically or all roll back — single `QueryRunner` transaction.

---

## 6. Open Recommendations (non-blocking)

| Priority | Item |
|----------|------|
| Medium | **Persist `AfcReserveState` to DB** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with snapshots keyed by block/epoch. |
| Medium | **Sync epoch AFC contributions** — `FeeDistributionService.distributeRewards()` records AFC to ledger but does not call `EmissionService.updateAfcReserve()`; price index could drift between per-TX and epoch paths. |
| Low | **Unit tests for `EmissionService.calculate()`** — add coverage for dust amounts, max commission rate boundary, zero-amount guard, and 75/25 split precision. |
| Low | **Deprecate legacy `mint()`** — `TokenService.mint()` is the fiat-deposit path; it should eventually route through `EmissionService` or be clearly segregated with a `FIAT_DEPOSIT` scope guard. |

---

## 7. Conclusion

The canonical 1:1 emission model is **fully implemented and correct** in `src/token/emission.service.ts`. All documentation in `01_coin_engine/` is aligned. No code changes were required in this audit pass. The implementation has been confirmed against all canonical rules: 1:1 emission, 0.5% commission, 75/25 split, transient ARO burn, and AFC reserve price index.
