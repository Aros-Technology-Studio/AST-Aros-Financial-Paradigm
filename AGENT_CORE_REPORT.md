# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-CsjA8`  
**Date:** 2026-06-03  
**Task:** Audit ArosCoin emission logic against the canonical model; fix all remaining gaps from previous pass  
**Previous pass:** `claude/inspiring-cannon-4qbjK` (2026-05-12, PR #79 → merged to main as commit `f6239f9`)

---

## 1. Canonical Model Reference

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × rate    (default 0.5%)
Node Share   = Commission × 0.75            (75% → processing nodes, weighted by PoT)
AFC Reserve  = Commission × 0.25            (25% → locked in AFC reserve contract)
ARO Burn     = Emission Amount              (ARO destroyed after TX completes)
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000   (price of next emission rises)
```

---

## 2. Directory Audit

### 01_coin_engine — Documentation only

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC index, example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split, validator weight formula |
| `burn_and_mint_rules.md` | ✅ No conflicts |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code

| File | Status |
|------|--------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve` now public |
| `emission.service.spec.ts` | ✅ **NEW** — 17 unit tests covering calculate(), reserve index, full lifecycle |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a documented no-op; price via `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Canonical 75/25 + AFC sync

| File | Status |
|------|--------|
| `fee_distribution.service.ts` | ✅ 75/25 epoch split; **FIXED** — now calls `emissionService.updateAfcReserve()` after epoch AFC recording |

### src/integration/ingestion/ — Wired to canonical entry point

| File | Status |
|------|--------|
| `ingestion.service.ts` | ✅ **FIXED** — calls `tokenService.mintForTransaction()` (was commented-out `mint()`) |
| `ingestion.module.ts` | ✅ **FIXED** — imports `TokenModule` via `forwardRef` |

---

## 3. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emissionAmount = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC synced to EmissionService | Yes | ✅ **FIXED** — `emissionService.updateAfcReserve(afcReserve)` called after epoch |
| Ingestion uses canonical entry point | Yes | ✅ **FIXED** — `mintForTransaction()` in `IngestionService` |
| Unit tests for EmissionService | Yes | ✅ **NEW** — `emission.service.spec.ts` |

---

## 4. Changes Made in This Pass

### `src/token/emission.service.ts`
- Made `updateAfcReserve()` **public** (was `private`) so epoch-level fee distribution can sync the in-memory AFC reserve index

### `src/fee_distribution/fee_distribution.service.ts`
- Added `EmissionService` import and constructor injection  
- After recording AFC reserve ledger entry in `distributeRewards()`, now calls `this.emissionService.updateAfcReserve(afcReserve)` to keep the price index current across epoch boundaries

### `src/integration/ingestion/ingestion.service.ts`
- Added `TokenService` constructor injection  
- Replaced the commented-out `// this.tokenService.mint(...)` with `await this.tokenService.mintForTransaction(mintedAros, senderAddress, referenceId)`  
- All cross-chain asset ingestion now flows through the canonical emission lifecycle (1:1 mint → fee split → burn → AFC index update)

### `src/integration/ingestion/ingestion.module.ts`
- Added `forwardRef(() => TokenModule)` import so `IngestionService` can resolve `TokenService`

### `src/token/emission.service.spec.ts` (new file)
- 17 unit tests covering:
  - `calculate()` — 1:1 invariant, 0.5% commission, 75/25 split, custom rate, dust amounts, error guards
  - `updateAfcReserve()` — monotonic growth, correct `sqrt`-based index formula, snapshot isolation
  - `processTransactionEmission()` — 4 ledger entries, MINT/BURN symmetry, atomic rollback on failure

---

## 5. Implementation Detail

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

### FeeDistributionService — Epoch AFC sync

```
distributeRewards(epoch, totalFees, weights)
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.updateAfcReserve(afcReserve)  ← NEW: syncs price index
  └─ for each node: Ledger VALIDATOR_REWARD: nodePool × weight → nodeId
```

### IngestionService — Canonical entry point

```
ingestAsset(assetSymbol, amount, senderAddress)
  ├─ validate asset symbol
  ├─ apply mock oracle rate
  └─ tokenService.mintForTransaction(mintedAros, senderAddress, referenceId)
       └─ delegates to EmissionService.processTransactionEmission()
```

---

## 6. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 7. Example: $10,000 Transaction

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

## 8. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. `IngestionService` always enters through `mintForTransaction()` — legacy `mint()` path bypassed

---

## 9. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add a `AfcReserveEntity` table with periodic snapshots and a load-on-start routine.
- **Wire real oracle rates** in `IngestionService.getMockRate()` — replace hard-coded values with an `OracleService` for live asset prices.
- **Max commission rate bound** — add a governance-enforced ceiling (e.g. 5%) to `updateCommissionRate()` to prevent accidental over-billing.
