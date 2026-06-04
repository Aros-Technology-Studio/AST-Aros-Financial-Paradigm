# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-rKJvc`  
**Date:** 2026-05-12  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation; add missing tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Describes canonical 1:1 formula, 75/25 split, AFC reserve index |
| `aro_emission_protocol.md` | ✅ Canonical protocol spec — 1:1 emission, burn-on-completion, 75/25 split |
| `payment_distribution.md` | ✅ Documents 75/25 canonical split |
| `burn_and_mint_rules.md` | ✅ General burn-on-withdrawal policy; no contradictions |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. No code changes required here.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here; no changes required.

### src/token/ — Status: Canonical code confirmed correct ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields canonical |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented and verified (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` serves fiat-bridge path only |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `emission.service.spec.ts` | ✅ **Added by this agent** — 18 unit tests covering `calculate()`, `processTransactionEmission()`, AFC reserve index, and rollback |

### src/fee_distribution/ — Status: Canonical split confirmed ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### tests/ — Status: Python test suite added ✅

| File | State |
|------|-------|
| `tests/test_emission.py` | ✅ **Added by this agent** — 22 language-agnostic arithmetic tests |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| nodeShare + afcShare == commission | Yes | ✅ verified by test |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change per TX = 0 | Yes | ✅ mint and burn of same amount in atomic block |

**Result: NO divergence found. Code matches canonical model exactly.**

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
  ├─ (atomic QueryRunner transaction begins)
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  ├─ updateSupplySnapshot(): totalMinted++, totalBurned++, circulatingSupply unchanged
  └─ (commit — or rollback all 4 ops on any failure)
```

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After first TX (12.50 AFC accumulated):
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission priced at a higher index
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing — only grows, never shrinks
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Changes Made in This Agent Pass

| File | Action |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — 18 TypeScript unit tests for `EmissionService` |
| `tests/test_emission.py` | **Created** — 22 Python arithmetic verification tests |
| `AGENT_CORE_REPORT.md` | **Updated** — reflects this agent pass; no prior code changes needed |

No production code was modified — the canonical implementation was already correct.

---

## 7. Outstanding Recommendations

These are improvements beyond the canonical model compliance check:

1. **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots or load from `SupplySnapshot` on startup.
2. **Wire `mintForTransaction()` into all ingestion paths** — `IngestionService` (`src/integration/ingestion/ingestion.service.ts`) mocks token minting (call commented out). When activated, it should call `TokenService.mintForTransaction()`, not the legacy `mint()`.
3. **Epoch AFC sync to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC on the ledger but does not call `EmissionService.updateAfcReserve()`. After each epoch finalization, the in-memory `reserveIndex` should be synced.
4. **Add integration test** covering full TX lifecycle via `processTransactionEmission()` against a real database.
