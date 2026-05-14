# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-Nz6ia`  
**Date:** 2026-05-14  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code if divergent

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Verified state |
|------|---------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid lifecycle diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split documented |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; added `recordEpochAfcContribution()` (public) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat-deposit path |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is `@deprecated` no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Fixed ✅ (one gap patched this run)

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split; `EmissionService` injected; AFC index now synced after each epoch |

**Gap found and fixed:** `distributeRewards()` wrote the epoch AFC portion to the ledger but never called
`EmissionService.updateAfcReserve()`. The in-memory price index therefore only reflected per-transaction
contributions and missed every epoch-level AFC deposit. Fixed by injecting `EmissionService` and calling
`emissionService.recordEpochAfcContribution(afcReserve)` immediately after the ledger record.

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

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
| Epoch AFC synced to price index | Yes | ✅ **Fixed this run** — `recordEpochAfcContribution()` called post-epoch |

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
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch finalization (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.recordEpochAfcContribution(afcReserve)   // ← NEW: syncs price index
  └─ for each node: Ledger VALIDATOR_REWARD: nodePool × weight → nodeId
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

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws if ≤ 0)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (incremented by both per-TX and per-epoch AFC)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Code Changes Made in This Run

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added public `recordEpochAfcContribution(amount)` — delegates to private `updateAfcReserve()` |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; call `recordEpochAfcContribution(afcReserve)` after epoch AFC ledger record |
| `AGENT_CORE_REPORT.md` | Updated with current audit findings |

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots loaded on boot.
- **Wire `mintForTransaction()` into ingestion/bridge** — replace remaining legacy `mint()` calls with the canonical entry point once fiat-deposit semantics are clarified.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and epoch AFC sync.
