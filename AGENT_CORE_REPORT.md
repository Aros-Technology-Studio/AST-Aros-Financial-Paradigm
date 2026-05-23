# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-C70uk`  
**Audit date:** 2026-05-23  
**Task:** Full audit of ArosCoin emission logic across all modules; enforce canonical model; document findings.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation-only module (Deprecated as reference, superseded by Module 08)

Module 01 contains **only Markdown specification files** — no TypeScript or Solidity source code.  
The `docs/architecture/Architecture_Overview.md` explicitly marks it as:
> *"DEPRECATED/Reference. Defines the conceptual economic model and emission protocols. (Superseded by Module 08.)"*

All specification files were aligned with the canonical model in a prior pass and are now correct.

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Documents canonical 1:1 formula + AFC index |
| `aro_emission_protocol.md` | ✅ Documents canonical emission + 75/25 split + burn flow |
| `payment_distribution.md` | ✅ 75/25 split documented correctly |
| `burn_mechanism.md` | ✅ Correct general burn-on-completion policy |
| `burn_and_mint_rules.md` | ✅ Non-contradictory, left as-is |

**→ Canonical source code lives in `src/token/emission.service.ts`, NOT in this module.**

---

### 10_proof_of_transaction_engine — Status: Documentation-only, no emission logic

Contains PoT validation specs (`pot_tx_validation_logic.md`, `pot_tx_weighting_model.md`, etc.).  
Actual PoT code: `src/proof_of_transaction_engine/pot.service.ts`.  
**No emission logic here — correct.**

---

### src/token/ — Status: Canonical code ✅ CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — MINT → FEE_SPLIT → AFC_UPDATE → BURN |
| `token.service.ts` | ✅ `mintForTransaction()` is canonical entry point; delegates to `EmissionService` |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` marked `@deprecated`; no-op preserved for backwards-compat |
| `token.module.ts` | ✅ `EmissionService` registered as provider **and exported** |

---

### src/fee_distribution/ — Status: Fixed in this pass ⚡

| File | Action |
|------|--------|
| `fee_distribution.service.ts` | **Fixed:** now injects `EmissionService` and calls `recordEpochAfcContribution()` after each epoch's 25% AFC allocation |

**Issue found & resolved:** `distributeRewards()` was recording AFC reserve contributions on the ledger but did **not** update the in-memory `reserveIndex` inside `EmissionService`. This violated the canonical rule *"AFC reserve grows → price of next emission rises"* for epoch-level contributions. Fixed by:
1. Adding `EmissionService.recordEpochAfcContribution(amount)` public method
2. Injecting `EmissionService` into `FeeDistributionService`
3. Calling `recordEpochAfcContribution(afcReserve)` after every successful epoch AFC ledger record

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic DB transaction |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` — canonical split |
| Epoch AFC updates reserveIndex | Yes | ✅ **Fixed in this pass** — `recordEpochAfcContribution()` now called |
| Net supply change per TX cycle = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged |
| Atomicity | Yes | ✅ All 4 ledger steps within single `QueryRunner` transaction |

---

## 3. Implementation Anatomy

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1, no multiplier
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75 // 75% → nodes
  │    afcShare       = commission × 0.25 // 25% → AFC reserve
  │
  ├─ DB QueryRunner.startTransaction()
  │
  ├─ Step 1 — Ledger MINT:             emissionAmount → recipient
  ├─ Step 2a — Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL
  ├─ Step 2b — Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE
  ├─ Step 3  — updateAfcReserve(afcShare):
  │              totalReserve  += afcShare
  │              reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Step 4  — Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
  ├─ Step 5  — updateSupplySnapshot()  (totalMinted++, totalBurned++, circulatingSupply unchanged)
  │
  └─ DB QueryRunner.commitTransaction()  // atomic: all-or-nothing
```

### FeeDistributionService — Epoch lifecycle (`src/fee_distribution/fee_distribution.service.ts`)

```
finalizeEpoch(epochNumber)
  │
  ├─ calculateTotalFees(epochStart, epochEnd)
  ├─ getConnectedNodes()  +  PoTService.calculateNormalizedWeights()
  │
  └─ distributeRewards(epoch, totalFees, weights)
       │
       ├─ nodePool   = totalFees × 0.75
       ├─ afcReserve = totalFees × 0.25
       │
       ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
       ├─ emissionService.recordEpochAfcContribution(afcReserve)  ← [FIXED]
       │    → updateAfcReserve(afcReserve)
       │    → reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
       │
       └─ For each node: Ledger VALIDATOR_REWARD: nodePool × weight → nodeId
```

---

## 4. System Addresses

| Role | Address constant |
|------|-----------------|
| Emission Authority | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| Node Pool | `SYSTEM_NODE_POOL_00000000000000000000` |
| AFC Reserve | `SYSTEM_AFC_RESERVE_000000000000000000` |
| Burn Vault | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 5. Canonical Example: $10,000 Transaction

```
Input:         TX Amount = 10,000 ARO

Step 1 MINT:   10,000 ARO minted → recipient wallet
Step 2 FEES:   Commission = 10,000 × 0.005 = 50 ARO
  → Node pool: 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  → AFC reserve: 50 × 0.25 = 12.50 ARO  (locked in reserve)
Step 3 INDEX:  reserveIndex = 1.0 + sqrt(12.50) / 10,000 = 1.00003536...
Step 4 BURN:   10,000 ARO destroyed → BURN_VAULT

Net circulating supply change: 0  (mint + burn cancel)
AFC reserve: +12.50 ARO
Next emission price: 1.00003536 × base
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcReserveShare == commission` — exact split (float precision only)
3. Per canonical TX cycle: `SupplySnapshot.totalMinted += E`, `totalBurned += E`, `circulatingSupply` unchanged
4. `reserveIndex` is **monotonically non-decreasing** — updated only via `updateAfcReserve(amount > 0)`
5. All four emission ledger steps succeed or all roll back — atomic `QueryRunner` transaction
6. `reserveIndex` now reflects **both** per-transaction and per-epoch AFC contributions — enforced by `recordEpochAfcContribution()` ← **Fixed in this pass**

---

## 7. Changes Made in This Audit Pass (2026-05-23)

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added `recordEpochAfcContribution(amount)` public method — routes epoch AFC amounts through `updateAfcReserve()` to keep `reserveIndex` in sync |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; calls `recordEpochAfcContribution(afcReserve)` after AFC ledger entry in `distributeRewards()` |

---

## 8. Open Recommendations

| Priority | Recommendation |
|----------|---------------|
| 🔴 High | **Persist `AfcReserveState` to DB** — currently in-memory; lost on process restart. Add `AfcReserveEntity` table; load on startup, snapshot periodically. |
| 🟡 Medium | **Wire `mintForTransaction()` into ingestion/bridge path** — replace all remaining `TokenService.mint()` calls with the canonical entry point. |
| 🟡 Medium | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, boundary commission rates, zero-amount guard, epoch sync. |
| 🟢 Low | **Epoch AFC race condition** — if two epochs finalize concurrently, `totalReserve` increments may interleave. Add a mutex or database-based lock on `AfcReserveState`. |
