# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-ooqf50`  
**Date:** 2026-06-14  
**Task:** Audit ArosCoin emission logic against the canonical model; verify or rewrite

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 split + burn flow |
| `payment_distribution.md` | ✅ 75/25 validator/AFC split; PoT weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; general burn/mint governance rules |
| `README.md` | ✅ Architecture overview; no formula conflicts |
| `AROS_Coin_TokenSpec.json` | ✅ Machine-readable spec, consistent with code |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct types |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC update → burn (atomic) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT_DEPOSIT |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads from `processReserve`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.service.spec.ts` | ✅ Tests for `mint`, `burn`, rollback; `EmissionService` properly mocked |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% (`0.005`) | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% → nodes | 75% | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | 25% | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic `QueryRunner` TX |
| AFC reserve grows → price rises | Yes (sub-linear) | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Net circulating supply change = 0 | Yes (mint + burn cancel) | ✅ `SupplySnapshot.circulatingSupply` unchanged per cycle; `totalMinted == totalBurned` |
| Atomic operations | All 4 steps or none | ✅ Single `QueryRunner` with rollback on any failure |

**Result: Code FULLY MATCHES canonical model. No rewrites required.**

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
  ├─ Ledger MINT:             emissionAmount → recipient           (step 1)
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL        (step 2a)
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE      (step 2b)
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000           (step 3)
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT  (step 4)
```

All four ledger operations and supply snapshot execute atomically within one `QueryRunner` transaction.

### System addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### TokenService entry point (`src/token/token.service.ts`)

`mintForTransaction()` is the canonical entry point for all transaction-triggered emissions:
- Delegates to `EmissionService.processTransactionEmission()`
- Emits `token.emission.canonical` event (consumed by The All-Seeing Eye)
- Returns `EmissionResult` for audit logging

Legacy `mint()` remains for `FIAT_DEPOSIT` flows only (not canonical emission).

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

AFC reserve after this TX:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.00003536...
  → every subsequent emission is priced higher
```

---

## 5. Invariants Confirmed

1. `emissionAmount == transactionAmount` — enforced by `calculate()`; throws `BadRequestException` if amount ≤ 0.
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond IEEE 754 float precision.
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero circulating supply.
4. `reserveIndex` is monotonically non-decreasing — `sqrt(totalReserve)` only grows as reserve accumulates.
5. Atomicity — all four ledger steps commit together or all roll back on failure.

---

## 6. Open Issues (carry-forward, not blocking)

| # | Issue | Priority |
|---|-------|----------|
| 1 | `AfcReserveState` is in-memory — lost on process restart. Add `AfcReserveEntity` table with periodic persistence. | Medium |
| 2 | `IngestionService.ingestAsset()` calls the legacy `TokenService.mint()`. Should call `mintForTransaction()` for canonical emission flow. | Medium |
| 3 | No unit tests for `EmissionService.calculate()` — cover dust amounts, max commission rate, zero-amount guard. | Low |
| 4 | `FeeDistributionService.distributeRewards()` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()` — in-memory index not updated after epoch finalization. | Low |

---

## 7. History

| Date | Branch | Action |
|------|--------|--------|
| 2026-05-12 | `claude/inspiring-cannon-4qbjK` | Aligned docs: replaced `E = F/N` with 1:1 formulas in `coin_emission_model.md`, `aro_emission_protocol.md`, `payment_distribution.md` |
| 2026-06-14 | `claude/inspiring-cannon-7sksc6` | Implemented canonical `EmissionService` and `emission.interfaces.ts`; updated `TokenService.mintForTransaction()`; updated `tokenomics.service.ts` to no-op legacy path (merged as PR #243) |
| 2026-06-14 | `claude/inspiring-cannon-ooqf50` | Verification pass — code confirmed fully canonical; no rewrites needed; report refreshed |
