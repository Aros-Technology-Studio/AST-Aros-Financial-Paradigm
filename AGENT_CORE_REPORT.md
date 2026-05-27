# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-amurM`  
**Date:** 2026-05-27  
**Task:** Full re-audit of ArosCoin emission logic; find deviations from canonical model; fix and verify

> **Supersedes** the 2026-05-12 report (branch `claude/inspiring-cannon-4qbjK`).  
> Previous pass aligned the spec docs (`01_coin_engine/*.md`).  
> This pass aligned the **source code** (`src/token/token.service.ts`).

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Pre-patch content | Action taken |
|------|------------------|--------------|
| `coin_emission_model.md` | Described `E = F / N` (fee ÷ nodes) — diverged from canonical 1:1 | **Rewritten** to canonical model |
| `aro_emission_protocol.md` | `EMISSION_AMOUNT = Σ(load × index × ratio)` — diverged | **Rewritten** to canonical formulas |
| `payment_distribution.md` | 60/15/15/5/5 multi-actor split — diverged from canonical 75/25 | **Rewritten** to 75/25 |
| `burn_and_mint_rules.md` | Correct general burn-on-withdrawal policy; no 1:1 mention | Left as-is (non-contradictory) |
| `README.md` | Architecture overview; no formula conflicts | Left as-is |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
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

## 6. Documentation Changes Made in This Pass

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split; added validator weight formula |

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add a `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.

---

## 8. Pass-2 Changes (2026-05-27)

### Deviations Found

| Location | Issue | Severity |
|----------|-------|----------|
| `src/token/token.service.ts` → `mint()` | No commission calculation; no 75/25 split; `tx.fee` = `undefined` | **High** |
| `src/token/token.service.ts` → `burn()` | No commission calculation; no 75/25 split; `tx.fee` = `undefined` | **High** |

> `EmissionService` itself was already fully canonical. The deviations were only in the  
> legacy bridge-layer methods (`mint` / `burn`) of `TokenService`.

### Fixes Applied

**`src/token/token.service.ts`**

1. Added canonical system address constants:
   ```typescript
   private readonly FEE_POOL_ADDRESS    = 'SYSTEM_FEE_POOL_00000000000000000000';
   private readonly NODE_POOL_ADDRESS   = 'SYSTEM_NODE_POOL_00000000000000000000';
   private readonly AFC_RESERVE_ADDRESS = 'SYSTEM_AFC_RESERVE_000000000000000000';
   ```

2. `mint()` — fiat bridge deposit now applies canonical fee distribution:
   - Calls `this.emissionService.calculate(amount_num)` to get commission breakdown
   - Sets `fee: emissionCalc.commission.toFixed(8)` on the MINT ledger record
   - Records `FEE_DISTRIBUTION` → 75% to `SYSTEM_NODE_POOL` (operation: `NODE_FEE_75PCT`)
   - Records `FEE_DISTRIBUTION` → 25% to `SYSTEM_AFC_RESERVE` (operation: `AFC_RESERVE_25PCT`)
   - Emits event payload now includes `commission`, `nodeShare`, `afcReserveShare`
   - Marked `@deprecated` with note to use `mintForTransaction()` for canonical emission

3. `burn()` — fiat bridge withdrawal now applies canonical fee distribution:
   - Same commission calculation and `FEE_DISTRIBUTION` steps as `mint()` fix
   - Sets `fee: emissionCalc.commission.toFixed(8)` on the BURN ledger record
   - Marked `@deprecated`
   - Clarified that post-commit bridge-call failure must be handled by retry at bridge layer

**`src/token/emission.service.spec.ts`** *(NEW)*

23 test cases covering:
- `calculate()`: 1:1 ratio, 0.5% rate, 75/25 split, no-leakage invariant, custom rate, boundary guards
- `updateCommissionRate()`: governance bounds
- `processTransactionEmission()`: full lifecycle, MINT→FEE→FEE→BURN step order, AFC reserve growth, monotonic price index, DB commit/rollback
- Supply snapshot: `totalMinted == totalBurned` invariant, `circulatingSupply == 0` net-zero invariant

### Architecture Diagram (Two Emission Paths)

```
Canonical Emission (transaction processing)        Legacy Bridge Emission
        │                                                  │
mintForTransaction(txAmount, recipient, refId)       mint(amount, recipient, refId)
        │                                                  │
EmissionService.processTransactionEmission()    commission = emissionService.calculate()
        │                                                  │
  ┌─────┴──────────────────────────────────┐     ┌────────┴───────────────────┐
  │ MINT   10,000 ARO → recipient          │     │ MINT   amount → recipient  │
  │ FEE    37.5 ARO   → NODE_POOL (75%)   │     │ FEE    nodeShare → NODE_POOL│
  │ FEE    12.5 ARO   → AFC_RESERVE (25%) │     │ FEE    afcShare  → AFC_RES  │
  │ BURN   10,000 ARO → BURN_VAULT        │     │ (NO BURN — user holds ARO)  │
  └─────┬──────────────────────────────────┘     └────────┬───────────────────┘
  circulatingSupply Δ = 0                    circulatingSupply Δ = +amount
  (transient ARO — exists only during TX)    (fiat deposit → real ARO balance)
```

### Final Status After Pass-2

| Component | Status |
|-----------|--------|
| `EmissionService` | ✅ Canonical — unchanged |
| `TokenService.mintForTransaction()` | ✅ Canonical — unchanged |
| `TokenService.mint()` | ✅ Fixed — canonical 75/25 split added |
| `TokenService.burn()` | ✅ Fixed — canonical 75/25 split added |
| `FeeDistributionService` | ✅ Canonical — unchanged |
| `PoTService` | ✅ Canonical — unchanged |
| `01_coin_engine/` | ✅ Active spec — not deprecated |
| `emission.service.spec.ts` | ✅ New — 23 canonical invariant tests |
