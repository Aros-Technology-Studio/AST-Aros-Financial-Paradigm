# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-8teo2a`  
**Date:** 2026-06-13  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation; add missing tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code, not deprecated)

Module 01 is pure documentation. The canonical source code lives in `src/token/`.

| File | Current state |
|------|---------------|
| `coin_emission_model.md` | ✅ Documents canonical 1:1 formula, 75/25 split, AFC reserve index |
| `aro_emission_protocol.md` | ✅ Full canonical protocol including Mermaid sequence diagram |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy; non-contradictory |
| `payment_distribution.md` | ✅ Canonical 75/25 distribution documented |
| `README.md` | ✅ Architecture overview; no formula conflicts |

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution. No emission logic is implemented here — it is all narrative specification. Actual PoT runtime code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code confirmed correct ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct types |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic QueryRunner TX |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` correctly marked `@deprecated` as no-op |
| `emission.service.spec.ts` | ✅ **NEW — added this session** — 19 unit tests covering all canonical invariants |

### src/fee_distribution/ — Status: Canonical code confirmed correct ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% → nodes | yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | yes | ✅ BURN ledger entry for full `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fee distribution also 75/25 | yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change per TX = 0 | yes | ✅ `SupplySnapshot.circulatingSupply` unchanged (mint cancels burn) |
| All lifecycle steps atomic | yes | ✅ Single `DataSource.QueryRunner` transaction with rollback on any error |

---

## 3. Implementation Detail

### EmissionService canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount                 // 1:1
  │    commission     = txAmount × rate           // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:              emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION:  nodeShare      → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION:  afcShare       → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:              emissionAmount → SYSTEM_BURN_VAULT
       └─ updateSupplySnapshot(): totalMinted++, totalBurned++, circulatingSupply unchanged
```

All five steps execute atomically within a single `QueryRunner` transaction.

### System addresses

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch end)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve contract)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out in same QueryRunner TX)

After 12.50 ARO accumulated in AFC reserve:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced slightly higher
```

---

## 5. Invariants (all verified by unit tests)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on `amount <= 0`
2. `nodeShare + afcShare == commission` — exact split; no rounding loss beyond float precision
3. `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` — net zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — grows after every emission, never decreases
5. All lifecycle steps succeed or all roll back — single atomic `QueryRunner` transaction

---

## 6. New Test Coverage (this session)

File created: `src/token/emission.service.spec.ts`  
**19 tests, all passing.**

| Suite | Tests |
|-------|-------|
| `calculate()` — canonical 1:1 model | 1:1 emission, 0.5% commission, 75/25 split, custom rate, zero/negative guard, dust amount |
| `processTransactionEmission()` — full lifecycle | 4 ledger entries (MINT+FEE×2+BURN), 1:1 mint, net-zero burn, commit on success, rollback on error |
| AFC reserve state | initial index=1.0, monotonic growth, formula verification, snapshot immutability |
| `updateCommissionRate()` | rate applied, rejects ≥1, rejects ≤0 |

---

## 7. Open Recommendations

The following items were flagged in the previous report (PR #72) and remain open:

1. **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table and load the latest snapshot on `onModuleInit`.

2. **Wire `mintForTransaction()` into ingestion pipeline** — `src/integration/ingestion/ingestion.service.ts` and the bridge layer still call the legacy `mint()`. Replace with `mintForTransaction()` for full canonical coverage end-to-end.

3. **Sync `FeeDistributionService` AFC share into `EmissionService.updateAfcReserve()`** — epoch-level fees are recorded to the AFC reserve ledger address, but `EmissionService.afcReserveState.totalReserve` is not updated after epoch finalization. This means the in-memory `reserveIndex` only reflects per-TX accumulation, not epoch-level fees.

---

## 8. Conclusion

The canonical 1:1 emission model is **fully implemented and correct** in `src/token/emission.service.ts`. All documentation in `01_coin_engine/` and `10_proof_of_transaction_engine/` is aligned with the canonical model. The code matches every invariant of the specification:

- Emission = Transaction Amount (1:1)  
- Commission = 0.5% → 75% nodes / 25% AFC reserve  
- ARO burned on TX completion (net-zero supply change)  
- AFC reserve grows → `reserveIndex` rises monotonically  

No code changes were required. This session added 19 missing unit tests for `EmissionService` that close the primary gap identified in the previous audit.
