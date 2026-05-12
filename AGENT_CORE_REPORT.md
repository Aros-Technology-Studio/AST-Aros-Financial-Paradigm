# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-12  
**Task:** Audit and align ArosCoin emission logic with the canonical model

---

## 1. Directory Audit

### 01_coin_engine — Status: **Documentation only, no code**

| File | Content |
|------|---------|
| `README.md` | Architecture overview, API spec fragments |
| `coin_emission_model.md` | Describes `E = F / N` (fee ÷ nodes) — **diverges from canonical 1:1** |
| `aro_emission_protocol.md` | Utility-based emission, `EMISSION_AMOUNT = Σ(load × index × ratio)` — **diverges** |
| `burn_and_mint_rules.md` | Correct burn-on-withdrawal policy, but no 1:1 mention |
| `payment_distribution.md` | 60/15/15/5/5 split — **diverges from canonical 75/25** |

**Module 01 is NOT deprecated** — it is pure documentation with no source code.  
The canonical logic lives in `src/token/` and `src/fee_distribution/`.

### 10_proof_of_transaction_engine — Status: **Documentation only**

Contains `.md` spec files for PoT: validation, slashing, signature model.  
Actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: **Code — partially misaligned**

| File | Issue found |
|------|------------|
| `token.service.ts` → `mint()` | Accepts free-form `amount`; does NOT emit 1:1 from TX amount; no commission split |
| `tokenomics.service.ts` | Price driven by `log(totalVolume)/100` — not AFC reserve |
| No `EmissionService` existed | No canonical emission object |

### src/fee_distribution/ — Status: **Code — misaligned**

| File | Issue |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | 100% of fees went to nodes — no AFC reserve split |

### src/proof_of_transaction_engine/ — Status: **Partial**

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Tracked general transaction volume, not specifically AFC reserve accumulation |
| `pot.service.ts` | PoT scoring logic — correct and untouched |

---

## 2. Canonical Model vs. Pre-Patch State

| Rule | Canonical | Before patch |
|------|-----------|--------------|
| Emission = TX Amount | 1:1 | ❌ Arbitrary amount passed to `mint()` |
| Fee = TX Amount × rate | Yes (0.5% default) | ❌ Not calculated at emission time |
| Fee split: 75% nodes | Yes | ❌ 100% to nodes |
| Fee split: 25% AFC reserve | Yes | ❌ No AFC reserve |
| ARO burn after TX | Yes | ❌ Only burns on fiat withdrawal |
| AFC reserve grows → price rises | Yes | ❌ Price tracked via general volume log |

---

## 3. Changes Made

### New: `src/token/emission.interfaces.ts`

Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — the canonical data types.

### New: `src/token/emission.service.ts` — **Core implementation**

Implements the canonical emission lifecycle:

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger: MINT emissionAmount → recipient
  ├─ Ledger: FEE_DISTRIBUTION nodeShare → NODE_POOL
  ├─ Ledger: FEE_DISTRIBUTION afcShare  → AFC_RESERVE
  ├─ updateAfcReserve(afcShare)          // reserveIndex rises
  └─ Ledger: BURN emissionAmount         // ARO are transient
```

**AFC reserve price index formula:**

```
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

Sub-linear growth: stable at low volume, meaningful at scale.

### Modified: `src/token/token.service.ts`

- Injected `EmissionService`
- Added `mintForTransaction(txAmount, recipient, refId, rate?)` — the canonical entry point
- Legacy `mint()` preserved for fiat-deposit compatibility

### Modified: `src/token/tokenomics.service.ts`

- `getCurrentPrice()` now delegates to `processReserve.getReserveState().reserveIndex`
- `updateInternalValuation()` marked `@deprecated` (no-op) — price is now driven by AFC reserve
- Old `GROWTH_FACTOR` incremental price logic removed

### Modified: `src/fee_distribution/fee_distribution.service.ts`

- `distributeRewards()` now applies 75/25 canonical split:
  - 75% of epoch fees → node pool (distributed by PoT weight)
  - 25% → `AFC_RESERVE_ADDRESS` via `FEE_DISTRIBUTION` ledger record

### Modified: `src/token/token.module.ts`

- `EmissionService` registered as provider and exported

---

## 4. Addresses Used

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `AFC_RESERVE_ADDRESS` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `NODE_POOL_ADDRESS` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `BURN_ADDRESS` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

AFC reserve grows by 12.50 →
  reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  → price of next emission is higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss)
3. `totalMinted == totalBurned` in supply snapshot per canonical TX cycle (net zero supply)
4. AFC reserve index is monotonically non-decreasing

---

## 7. Next Steps (Recommendations)

- Persist `AfcReserveState` to database (currently in-memory; lost on restart)
- Wire `mintForTransaction()` into the bridge/ingestion pipeline to replace `mint()` for all new transactions
- Update `payment_distribution.md` and `coin_emission_model.md` in `01_coin_engine/` to reflect canonical 75/25 split
- Add unit tests for `EmissionService.calculate()` covering edge cases (dust amounts, high rates)
