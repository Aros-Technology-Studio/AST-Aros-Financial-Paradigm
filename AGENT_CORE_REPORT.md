# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-h91M3`  
**Date:** 2026-05-17  
**Task:** Audit ArosCoin emission logic against canonical model; fix all deviations; confirm aligned code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Full mermaid sequence diagram, canonical formula, allocation flow |
| `payment_distribution.md` | ✅ 75/25 split, PoT weight formula, epoch vs per-TX table |
| `burn_and_mint_rules.md` | ✅ Non-contradictory, no canon conflicts |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code verified correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for internal burn-only path |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code verified correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/bridge/ — Status: **FIXED in this session**

| File | Issue | Fix applied |
|------|-------|-------------|
| `bridge.service.ts:56` | Called legacy `tokenService.mint()` — no burn, no canonical fee split | Replaced with `tokenService.mintForTransaction()` |

### src/token/token.controller.ts — Status: **FIXED in this session**

| Endpoint | Issue | Fix applied |
|----------|-------|-------------|
| `POST /api/v1/token/mint` | Called legacy `tokenService.mint()` | Replaced with `tokenService.mintForTransaction()` |

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
| Bridge deposits use canonical path | Yes | ✅ **FIXED** — `BridgeService` now calls `mintForTransaction()` |
| API `/mint` uses canonical path | Yes | ✅ **FIXED** — `TokenController` now calls `mintForTransaction()` |

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
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
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

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 6. Changes Made

### Session 2026-05-17 (this session)

| File | Change |
|------|--------|
| `src/bridge/bridge.service.ts` | Replaced `tokenService.mint()` with `tokenService.mintForTransaction()` — fiat deposit webhook now uses canonical 1:1 emission lifecycle |
| `src/token/token.controller.ts` | Replaced `tokenService.mint()` with `tokenService.mintForTransaction()` — POST `/api/v1/token/mint` now routes through canonical EmissionService |

### Session 2026-05-12 (prior agent pass — PR #72)

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split; added validator weight formula |
| `src/token/emission.service.ts` | New file — canonical `EmissionService` with 1:1 lifecycle |
| `src/token/emission.interfaces.ts` | New file — `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `src/token/token.service.ts` | Added `mintForTransaction()` canonical entry point |
| `src/fee_distribution/fee_distribution.service.ts` | Updated `distributeRewards()` to canonical 75/25 split |

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory in `EmissionService`; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots or load from last `SupplySnapshot` on boot.
- **Sync `FeeDistributionService` AFC contributions to `EmissionService`** — `distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` will diverge from epoch-level contributions.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and `nodeShare + afcShare == commission` assertion.
- **Wire `IngestionService`** — the crypto ingestion path (`src/integration/ingestion/ingestion.service.ts`) has a commented-out mint call; when activated, it must call `mintForTransaction()` not `mint()`.
