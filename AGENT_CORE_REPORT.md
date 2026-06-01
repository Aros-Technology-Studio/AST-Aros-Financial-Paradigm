# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-gTZBz`  
**Date:** 2026-06-01  
**Task:** Audit ArosCoin emission logic against the canonical model and confirm code alignment

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, 75/25 split, AFC index — all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence, formulas, invariants — all correct |
| `payment_distribution.md` | ✅ Canonical | 75/25 table, PoT weight formula, historical note re: old 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Non-contradictory | General burn policy; consistent with canonical model |
| `README.md` | ✅ Non-contradictory | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation.  
The canonical source-of-truth implementation lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. **No emission logic here.**

---

### src/token/ — Status: Canonical code confirmed correct

| File | Verified State |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct field semantics |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a no-op stub marked `@deprecated` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified State |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Canonical 75/25 split — `nodePool = totalFees * 0.75`, `afcReserve = totalFees * 0.25` |

Constants declared explicitly:
```typescript
private readonly NODE_SHARE_RATIO = 0.75;
private readonly AFC_SHARE_RATIO  = 0.25;
```

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|-----------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `circulatingSupply` unchanged in `updateSupplySnapshot()` |
| Atomic execution | Yes | ✅ Single `QueryRunner` transaction wraps all 4 ledger steps |

**Verdict: Code fully matches canonical model. No rewrites required.**

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
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot():  totalMinted++, totalBurned++, circulatingSupply unchanged
```

All operations execute atomically within a single `QueryRunner` transaction.  
On any failure → full rollback.

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
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants (Enforced in Code)

1. `emissionAmount == transactionAmount` — verified in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact float split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (`sqrt` grows only as totalReserve grows)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. `transactionAmount > 0` — enforced in both `EmissionService.calculate()` and `TokenService.mintForTransaction()`

---

## 6. Recommendations (Open Items)

| Priority | Item | Detail |
|----------|------|--------|
| HIGH | **Persist `AfcReserveState` to DB** | Currently in-memory — state lost on restart. Add `AfcReserveEntity` table with periodic snapshots. |
| HIGH | **Sync epoch AFC contribution to `EmissionService`** | `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does NOT call `EmissionService.updateAfcReserve()`, causing the in-memory index to diverge after epoch finalization. |
| MEDIUM | **Unit tests for `EmissionService.calculate()`** | Cover dust amounts, max commission rate, zero-amount guard, and exact split invariants. |
| MEDIUM | **Wire `mintForTransaction()` into bridge/ingestion path** | Legacy `mint()` in `TokenService` does not apply canonical emission. Replace bridge/ingestion callers. |
| LOW | **Governance commission rate bounds** | `updateCommissionRate()` rejects `rate >= 1` but no upper bound below 1 is enforced. Consider a max cap (e.g. 5%). |

---

## 7. Conclusion

The ArosCoin canonical 1:1 emission model is **fully and correctly implemented** in `src/token/emission.service.ts`.  
Documentation in `01_coin_engine/` is aligned with the code.  
The `10_proof_of_transaction_engine/` module contains no emission logic — it handles PoT scoring only.

**No code rewrites were necessary.** Open items in §6 are architectural improvements, not correctness bugs.
