# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-U5wUE`  
**Date:** 2026-05-27  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation; fix any deviations

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only *(NOT deprecated)*

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | Documents 1:1 formula, AFC reserve index `1.0 + sqrt(R)/10_000`, 75/25 split, burn cycle |
| `aro_emission_protocol.md` | ✅ Canonical | States `EMISSION = TX_AMOUNT` exactly; describes burn flow |
| `payment_distribution.md` | ✅ Canonical | 75% nodes / 25% AFC reserve |
| `burn_and_mint_rules.md` | ✅ Correct | General burn-on-withdrawal; no conflicts |
| `README.md` | ✅ Correct | Architecture overview; no formula conflicts |

> **Module 01 is NOT deprecated.** It is a pure documentation layer. The canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. **No emission logic lives here.**

---

### src/token/ — Status: ✅ Canonical implementation confirmed

| File | Verified State |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `syncAfcReserveFromEpoch()` added (see §4) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex` |
| `token.module.ts` | ✅ `EmissionService` registered as provider **and exported** |

---

### src/fee_distribution/ — Status: ✅ Fixed (epoch AFC → EmissionService sync)

| File | Change |
|------|--------|
| `fee_distribution.service.ts` | **Fixed:** Now injects `EmissionService` and calls `syncAfcReserveFromEpoch(afcReserve, epoch)` after each epoch AFC ledger record |

Previously, `distributeRewards()` correctly split fees 75/25 and wrote AFC to the ledger but **did not** notify `EmissionService`. The in-memory `reserveIndex` was therefore blind to epoch-level AFC accumulation. This gap is now closed.

---

## 2. Canonical Model Verification Table

| Rule | Canonical Spec | Code State |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC syncs `reserveIndex` | **Was missing** | ✅ **Fixed:** `syncAfcReserveFromEpoch()` called after each epoch |

All 8 rules now pass. ✅

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

syncAfcReserveFromEpoch(afcAmount, epochNumber)      ← NEW (2026-05-27)
  └─ updateAfcReserve(afcAmount)   // epoch-level AFC joins the same index
```

All four per-TX ledger operations execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch lifecycle (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.syncAfcReserveFromEpoch(afcReserve, epoch)  ← FIXED
  │
  └─ for each node:
       Ledger VALIDATOR_REWARD: nodePool × weight → nodeId
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
Emission       = 10,000 ARO  (minted to recipient, 1:1)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)

Net circulating change = 0  (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.000035355...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact canonical split
3. `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` — net-zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — only `updateAfcReserve()` can touch it, always adds
5. All four per-TX ledger steps succeed or all roll back — atomic `QueryRunner` transaction
6. Epoch AFC contributions are reflected in `reserveIndex` — `syncAfcReserveFromEpoch()` ensures this *(new)*

---

## 6. Changes Made in This Pass (2026-05-27)

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added `syncAfcReserveFromEpoch(afcAmount, epochNumber)` — public entry point for epoch-level AFC reserve sync |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; added `syncAfcReserveFromEpoch()` call in `distributeRewards()` after AFC ledger record |
| `AGENT_CORE_REPORT.md` | Updated to 2026-05-27 with full audit findings and fix documentation |

---

## 7. Outstanding Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots and reload on startup.
- **Wire `mintForTransaction()` into all ingestion paths** — replace any remaining `mint()` calls in the bridge/ingestion pipeline with the canonical `mintForTransaction()` entry point.
- **Add unit tests for `EmissionService.calculate()`** — cover edge cases: dust amounts, max commission rate boundary, zero-amount guard, and invariant `nodeShare + afcShare == commission`.
- **Sync on startup** — on service boot, query the ledger for all `AFC_RESERVE` type transactions to rehydrate `AfcReserveState.totalReserve` and recalculate `reserveIndex` deterministically.
