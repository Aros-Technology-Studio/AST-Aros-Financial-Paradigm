# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-M2rOo`  
**Date:** 2026-05-25  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation; fix any divergences

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Content state |
|------|--------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC index, example — correct |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow — correct |
| `payment_distribution.md` | ✅ Canonical 75/25 split — correct |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal policy — non-contradictory |
| `README.md` | ✅ Architecture overview — no formula conflicts |

**Note on "Deprecated" label:** Module 01 is marked `*(Deprecated)*` in the root README  
architecture table. This refers to it being documentation-only — the canonical source code  
lives in `src/token/`. Module 01 spec files are up-to-date and accurate.

---

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive  
distribution. Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission  
logic defined here.

---

### src/token/ — Status: Canonical; atomicity bug fixed in this pass

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; **atomicity bug fixed** (see §3) |
| `emission.service.spec.ts` | ✅ **Added** — 20 unit tests covering all canonical rules |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

### src/fee_distribution/ — Status: Canonical; verified correct

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

---

### src/ledger/ — Status: Fixed in this pass

| File | State |
|------|-------|
| `ledger.service.ts` → `recordTransaction()` | ✅ **Fixed** — accepts optional external `QueryRunner` to enable true atomicity |

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
| All steps atomic (rollback-safe) | Yes | ✅ **Fixed** — single shared `QueryRunner` for all 5 steps |

---

## 3. Bug Found & Fixed: False Atomicity in `processTransactionEmission()`

### Problem

Prior to this pass, `EmissionService.processTransactionEmission()` opened a single  
`QueryRunner` but only used it for `updateSupplySnapshot()`. The four  
`ledgerService.recordTransaction()` calls each created **their own** internal  
`QueryRunner`, committed immediately, and released.

**Consequence:** If step 4 (BURN) failed after step 1 (MINT) was already committed,  
the MINT record was on-chain with no corresponding BURN — a ghost emission violating  
the "net circulating change = 0" invariant.

```
Before fix:
  outer-QR.startTransaction()
    ledger.recordTransaction(MINT)   → inner-QR → commit ← cannot roll back!
    ledger.recordTransaction(NODE)   → inner-QR → commit ← cannot roll back!
    ledger.recordTransaction(AFC)    → inner-QR → commit ← cannot roll back!
    ledger.recordTransaction(BURN)   → inner-QR → ❌ fails
    updateSupplySnapshot(outer-QR)   ← never reached
  outer-QR.rollbackTransaction()     ← only rolls back supply snapshot (already skipped)
```

### Fix (two files)

**`src/ledger/ledger.service.ts`**  
Added an optional `externalRunner?: QueryRunner` parameter to `recordTransaction()`.  
When supplied, the method participates in the caller's transaction (no  
connect / commit / rollback / release). When omitted, behaviour is unchanged.

**`src/token/emission.service.ts`**  
All four `ledgerService.recordTransaction()` calls now receive the outer `queryRunner`.  
The supply snapshot already used it. Result: all 5 operations share one transaction.

Additional improvement: the in-memory `AfcReserveState` is snapshot-restored on DB  
rollback so it stays consistent with the persisted ledger.

```
After fix:
  outer-QR.startTransaction()
    ledger.recordTransaction(MINT,  outer-QR)  ← same TX
    ledger.recordTransaction(NODE,  outer-QR)  ← same TX
    ledger.recordTransaction(AFC,   outer-QR)  ← same TX
    updateAfcReserve() — in-memory (snaphotted for rollback)
    ledger.recordTransaction(BURN,  outer-QR)  ← same TX
    updateSupplySnapshot(outer-QR)             ← same TX
  outer-QR.commitTransaction()  ← all 5 steps committed atomically
  (on error → outer-QR.rollbackTransaction() + AFC state restored)
```

---

## 4. Canonical Lifecycle (Verified)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ [single QueryRunner — all steps below atomic]
  │
  ├─ Ledger MINT:             emissionAmount → recipient           (CANONICAL_1_1_EMISSION)
  ├─ Ledger FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL   (NODE_FEE_75PCT)
  ├─ Ledger FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE (AFC_RESERVE_25PCT)
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT  (POST_TX_CANONICAL_BURN)
  └─ updateSupplySnapshot():  totalMinted++, totalBurned++, circulatingSupply unchanged
```

---

## 5. Example: $10,000 Transaction

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

## 6. Invariants (All Verified by Tests)

| # | Invariant | Verified |
|---|-----------|---------|
| 1 | `emissionAmount == transactionAmount` | ✅ `emission.service.spec.ts` |
| 2 | `nodeShare + afcShare == commission` | ✅ `emission.service.spec.ts` |
| 3 | `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` | ✅ `emission.service.spec.ts` |
| 4 | `reserveIndex` is monotonically non-decreasing | ✅ `emission.service.spec.ts` |
| 5 | All 5 steps succeed or all roll back (atomic `QueryRunner`) | ✅ `emission.service.spec.ts` |
| 6 | In-memory AFC state rolls back on DB failure | ✅ `emission.service.spec.ts` |

**Test run result:** 89 tests, 0 failures, 0 skipped  
(`emission.service.spec.ts`: 20 tests — all green)

---

## 7. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 8. Open Recommendations (Not Blocking)

1. **Persist `AfcReserveState` to database.** Currently in-memory; lost on service  
   restart. Add an `AfcReserveEntity` table. On startup, load the last snapshot.

2. **Wire `mintForTransaction()` into the ingestion pipeline.** Replace any remaining  
   `TokenService.mint()` calls in bridge/ingestion with the canonical entry point  
   `mintForTransaction()`, which runs the full atomic lifecycle.

3. **Sync epoch AFC contributions with `EmissionService`.** `FeeDistributionService`  
   records AFC contributions on the ledger but does not call  
   `EmissionService.updateAfcReserve()`, so the in-memory price index does not  
   reflect epoch-level accumulation. Add a callback or service call after each  
   epoch finalization.

4. **Add integration tests** for the full `TokenService.mintForTransaction()` →  
   `EmissionService.processTransactionEmission()` → `LedgerService` chain with a  
   real in-memory SQLite database.
