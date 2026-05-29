# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-kWBP7`  
**Date:** 2026-05-29  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical protocol: 1:1 emission, 75/25 split, burn flow, mermaid diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split with PoT-normalized node weights |
| `burn_and_mint_rules.md` | ✅ Correct general burn policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical; one fix applied

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Correct: `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | **Fixed**: `getCurrentPrice()` now returns `EmissionService.getCurrentEmissionPrice()` |
| `token.module.ts` | ✅ All providers registered; no circular dependency |

### src/fee_distribution/ — Status: Canonical

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split; 75% → node pool by PoT weight, 25% → AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy volume ledger; `reserveIndex` via `log1p` — used by `TokenomicsService` (now replaced by canonical path) |
| `pot.service.ts` | PoT scoring and weight normalization — correct, untouched |

---

## 2. Fix Applied

### `src/token/tokenomics.service.ts` — `getCurrentPrice()` divergence

**Before:** `getCurrentPrice()` returned `processReserve.getReserveState().reserveIndex` — the legacy `log1p` index, unrelated to AFC accumulation.

**After:** `getCurrentPrice()` now returns `emissionService.getCurrentEmissionPrice()` — the canonical AFC index:

```
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

`EmissionService` is injected via `forwardRef` to avoid any initialization-order sensitivity within the shared `TokenModule`.

---

## 3. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| `getCurrentPrice()` returns canonical index | **Was broken** | ✅ Fixed — now via `EmissionService.getCurrentEmissionPrice()` |

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
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
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

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing — only `updateAfcReserve()` modifies it
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction
6. `getCurrentPrice()` everywhere returns the AFC sqrt index — no longer divergent

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots persisted at epoch boundaries.
- **Wire `mintForTransaction()` into all ingestion paths** — confirm all bridge/ingestion entry points call `mintForTransaction()`, not the legacy `mint()`.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and the `reserveIndex` monotonicity property.
- **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService.distributeRewards()` records the AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index should be updated after epoch finalization to keep it accurate.
