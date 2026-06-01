# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-DBXsp`  
**Date:** 2026-06-01  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or correct the implementation, and add missing unit tests.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (✅ aligned with canonical model)

| File | Content | Status |
|------|---------|--------|
| `coin_emission_model.md` | 1:1 formula, 75/25 split, AFC reserve index, example | ✅ Canonical |
| `aro_emission_protocol.md` | Full lifecycle, Mermaid flow, canonical formulas | ✅ Canonical |
| `burn_and_mint_rules.md` | Burn/mint guard logic, anti-abuse | ✅ Non-contradictory |
| `payment_distribution.md` | 75/25 node/AFC split with PoT weighting | ✅ Canonical |
| `README.md` | ACE architecture overview | ✅ No conflict |

**Module 01 is NOT deprecated** — it is pure specification documentation.  
Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only (✅ no emission code)

Spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT runtime lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed ✅ CORRECT

| File | Role | Status |
|------|------|--------|
| `emission.interfaces.ts` | `EmissionResult`, `EmissionConfig`, `AfcReserveState` types | ✅ Correct |
| `emission.service.ts` | Full canonical 1:1 lifecycle — **source of truth** | ✅ Correct |
| `emission.service.spec.ts` | Unit tests for `EmissionService` | ✅ Added this session |
| `token.service.ts` | `mintForTransaction()` delegates to `EmissionService` | ✅ Correct |
| `tokenomics.service.ts` | `updateInternalValuation()` deprecated no-op; price from `processReserve.reserveIndex` | ✅ Acceptable |
| `token.module.ts` | `EmissionService` registered and exported | ✅ Correct |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code (emission.service.ts) |
|------|---------------|---------------------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` |
| Commission = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Node Share | 75% of commission | ✅ `nodeShare = commission * 0.75` |
| AFC Reserve | 25% of commission | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes — transient supply | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| All 4 steps atomic | Yes | ✅ Single `QueryRunner` transaction, rollback on failure |

**Result: Implementation fully matches the canonical model. No corrections needed.**

---

## 3. Implementation Detail

### EmissionService canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount           // 1:1, no multiplier
  │    commission     = txAmount × rate    // 0.5% default
  │    nodeShare      = commission × 0.75  // 75% → processing nodes (PoT weighted)
  │    afcShare       = commission × 0.25  // 25% → AFC reserve contract
  │
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare    → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare     → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
       → SupplySnapshot: totalMinted++, totalBurned++, circulatingSupply unchanged
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
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO    (1:1 MINT → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO   (FEE_DISTRIBUTION → SYSTEM_NODE_POOL)
  AFC reserve  = 50 × 0.25  = 12.50 ARO   (FEE_DISTRIBUTION → SYSTEM_AFC_RESERVE)
Burn           = 10,000 ARO    (BURN → SYSTEM_BURN_VAULT)
Net circulating change = 0     (mint and burn cancel within same TX)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.00003536
  → every subsequent emission priced higher (sub-linear growth)
```

---

## 5. Supply Snapshot Invariants

Per canonical TX cycle (enforced in `EmissionService.updateSupplySnapshot()`):

| Invariant | Enforcement |
|-----------|-------------|
| `emissionAmount == transactionAmount` | `calculate()` — throws on violation |
| `nodeShare + afcShare == commission` | exact arithmetic in `calculate()` |
| `totalMinted == totalBurned` per TX cycle | `SupplySnapshot` increments both by `emissionAmount` |
| `circulatingSupply` unchanged per TX cycle | snapshot records `prevSupply` (net-zero) |
| `reserveIndex` monotonically non-decreasing | `updateAfcReserve()` only adds, never subtracts |
| All 4 ledger steps atomic | `QueryRunner` rolls back on any failure |

---

## 6. Changes Made This Session

| File | Action |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — comprehensive unit tests for `EmissionService` |
| `AGENT_CORE_REPORT.md` | **Refreshed** — updated audit report for 2026-06-01 pass |

### No code corrections required

The emission engine in `src/token/emission.service.ts` was already fully aligned with the canonical model before this session (implemented in commit `f6239f9`, PR #72). This session adds the missing unit test coverage.

---

## 7. Unit Tests Added (`emission.service.spec.ts`)

Test coverage added across 5 describe blocks:

| Suite | Tests |
|-------|-------|
| `calculate()` | 1:1 emission, default 0.5% commission, 75/25 split, no rounding loss, custom rate, dust amount, zero/negative guard |
| `AFC reserve price index` | Starts at 1.0, rises monotonically, matches `1.0 + sqrt(reserve) / 10_000` formula |
| `processTransactionEmission()` | 4 ledger calls, MINT to recipient, 75% node pool, 25% AFC, BURN = emission, rollback on failure, correct EmissionResult |
| `getAfcReserveState()` | Transaction count increments, totalReserve accumulates, snapshot is immutable copy |
| `updateCommissionRate()` | Accepts valid rate, rejects rate ≥ 1, rejects rate ≤ 0 |

---

## 8. Open Recommendations (carry-forward)

1. **Persist `AfcReserveState` to database** — currently in-memory and lost on restart. Add an `AfcReserveEntity` table with periodic snapshots for crash recovery.
2. **Wire `mintForTransaction()` into all ingestion paths** — the legacy `mint()` endpoint in `TokenController` bypasses `EmissionService`; institutional callers should use the canonical entry point.
3. **Epoch AFC sync** — `FeeDistributionService` records AFC reserve on-ledger but does not call `EmissionService.updateAfcReserve()` after epoch finalization; the in-memory `reserveIndex` diverges over time from the on-ledger total.
4. **Integration test for atomic rollback** — current spec tests mock the `QueryRunner`; an integration test against a real in-memory SQLite instance would verify the full atomicity guarantee.
