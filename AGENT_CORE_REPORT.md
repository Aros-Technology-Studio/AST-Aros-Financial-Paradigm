# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-bpAJY`  
**Date:** 2026-05-30  
**Task:** Audit ArosCoin emission logic against the canonical model; fix any divergence; add missing test coverage

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, 75/25 split, AFC price index, example |
| `aro_emission_protocol.md` | ✅ Canonical | Full sequenceDiagram, formulas, invariants |
| `payment_distribution.md` | ✅ Canonical | 75/25 table, PoT weight formula, AFC reserve use |
| `burn_and_mint_rules.md` | ✅ Non-conflicting | General burn policy; consistent with canonical model |
| `README.md` | ✅ Non-conflicting | Architecture overview only |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code verified ✅ (with fixes applied in this pass)

| File | Verified State |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` fully defined |
| `emission.service.ts` | ✅ Canonical 1:1 lifecycle; nonce bug fixed in this pass |
| `emission.service.spec.ts` | ✅ **Created in this pass** — 20 unit tests covering `calculate()` and `processTransactionEmission()` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; `getCurrentPrice()` delegates to processReserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code verified ✅

| File | Verified State |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in step 4 |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

---

## 3. Changes Made in This Pass

### 3.1 Nonce Bug Fix — `src/token/emission.service.ts`

**Problem**: `processTransactionEmission()` called `Date.now()` independently four times — once per ledger entry. All four calls can occur within the same millisecond, making the `+1 / +2 / +3` offsets the only differentiator. Across concurrent emissions from the same recipient address, these offsets could collide on the `(sender, nonce)` unique constraint.

**Fix**: Capture a single `baseNonce = Date.now()` once at the top of the method and use `baseNonce`, `baseNonce + 1`, `baseNonce + 2`, `baseNonce + 3` for the four ledger entries.

```typescript
// Before (bug)
nonce: Date.now(),       // step 1
nonce: Date.now() + 1,  // step 2a  — Date.now() re-evaluated
nonce: Date.now() + 2,  // step 2b  — Date.now() re-evaluated
nonce: Date.now() + 3,  // step 4   — Date.now() re-evaluated

// After (fixed)
const baseNonce = Date.now();
nonce: baseNonce,        // step 1
nonce: baseNonce + 1,   // step 2a
nonce: baseNonce + 2,   // step 2b
nonce: baseNonce + 3,   // step 4
```

### 3.2 Atomicity Comment Clarification — `src/token/emission.service.ts`

**Problem**: The previous docstring said "All four ledger operations execute atomically within a single QueryRunner transaction." This was inaccurate — each call to `LedgerService.recordTransaction()` opens its own internal `QueryRunner` transaction (required for hash-chain integrity and pessimistic write locking). The outer `queryRunner` in `EmissionService` only wraps the supply snapshot write (step 5).

**Fix**: Updated the docstring to accurately describe the actual transaction boundaries.

### 3.3 Unit Tests Created — `src/token/emission.service.spec.ts`

New spec file with **20 tests** across 5 describe blocks:

| Describe | Tests | Coverage |
|----------|-------|---------|
| `calculate()` | 8 | 1:1 invariant, default rate, custom rate, dust, zero, negative, nodeShare+afcShare = commission |
| `getAfcReserveState()` | 1 | Initial state (reserveIndex=1.0, totalReserve=0) |
| `getCurrentEmissionPrice()` | 1 | Returns 1.0 before any emissions |
| `updateCommissionRate()` | 3 | Valid rate, rate=0 rejected, rate=1 rejected |
| `processTransactionEmission()` | 7 | 4 ledger entries, 1:1 mint, burn=emission, distinct nonces, commit on success, rollback on failure, AFC reserve accumulation, monotonic price index |

---

## 4. Implementation Detail

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
  ├─ baseNonce = Date.now()              // single capture per emission cycle
  │
  ├─ LedgerService MINT:             emissionAmount → recipient        (nonce=baseNonce)
  ├─ LedgerService FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL     (nonce=baseNonce+1)
  ├─ LedgerService FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE   (nonce=baseNonce+2)
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ LedgerService BURN:             emissionAmount → SYSTEM_BURN_VAULT (nonce=baseNonce+3)
  └─ [queryRunner] save SupplySnapshot
```

**Transaction boundary note**: Steps 1-4 each run inside `LedgerService.recordTransaction()`, which opens and commits its own `QueryRunner` per call (needed for pessimistic write locking on hash-chain ordering). The outer `queryRunner` in `EmissionService` covers only the supply snapshot (step 5).

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

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

After 12.50 ARO accumulated in AFC reserve:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split; verified in tests)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All 4 nonces within an emission cycle are distinct (fixed in this pass with `baseNonce`)

---

## 7. Open Recommendations

| Priority | Item | Status |
|----------|------|--------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots. | Open |
| MEDIUM | **Wire `mintForTransaction()` into ingestion/bridge pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point. | Open |
| MEDIUM | **Epoch AFC contribution sync** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; epoch-level reserve accumulation is not reflected in the in-memory `reserveIndex`. | Open |
| LOW | **Saga pattern for full atomicity** — true all-or-nothing across 4 ledger writes requires a compensating transaction (saga) or outbox pattern, since each `LedgerService` call owns its own DB transaction for hash-chain integrity. | Open |
