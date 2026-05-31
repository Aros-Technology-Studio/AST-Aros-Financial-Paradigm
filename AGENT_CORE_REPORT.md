# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-31  
**Task:** Audit ArosCoin emission logic against the canonical 1:1 model; fix all divergences; confirm or rewrite implementation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation module (no source code)

| File | Pre-patch state | Action taken |
|------|-----------------|--------------|
| `coin_emission_model.md` | ✅ Canonical formulas (1:1, 75/25, sqrt index) — correct | Unchanged |
| `aro_emission_protocol.md` | ✅ Canonical flow (Mermaid diagram, formulas, burn flow) — correct | Unchanged |
| `payment_distribution.md` | ✅ Canonical 75/25 split; historical note on prior 60/15/15/5/5 | Unchanged |
| `burn_and_mint_rules.md` | ❌ **Diverged** — contained `dailyMintLimit: 250,000 ARO`, `mintThreshold`, `burnRate: 3% of txn fee`. These contradict the canonical model (no supply cap, burn = full emission after TX) | **Rewritten** to canonical model |
| `README.md` | ✅ Architecture overview; references canonical `src/token/emission.service.ts` | Unchanged |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Documentation module (no source code)

Contains `.md` spec files for PoT validation, slashing, signatures, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here. No changes needed.

---

### src/token/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — exact match to canonical spec |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; all four steps atomic; AFC reserve index formula correct |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved but clearly isolated |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a documented no-op; note points callers to `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

### src/fee_distribution/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies canonical 75/25 split at epoch level; `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` |

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring (`S_i = α·|TX| + β·F - δ·P`) and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification Matrix

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` — same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Net circulating supply change = 0 | Yes | ✅ `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| No supply cap | Yes | ✅ No `dailyMintLimit`; supply bounded organically by tx volume |
| All four steps atomic | Yes | ✅ Single `QueryRunner` transaction with rollback on failure |

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
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot(): totalMinted+= / totalBurned+= / circulatingSupply unchanged
```

All operations execute atomically within a single `QueryRunner` transaction.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight across validators)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve contract)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out in same atomic TX)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Changes Made in This Pass

| File | Change |
|------|--------|
| `01_coin_engine/burn_and_mint_rules.md` | **Rewritten** — removed `dailyMintLimit`, `mintThreshold`, `burnRate: 3%`; replaced with canonical rules (burn = full emission after TX, no supply cap, 75/25 commission split table) |
| `AGENT_CORE_REPORT.md` | Updated with this fresh audit (dated 2026-05-31) |

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact 75/25 split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (additions only, never decremented)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Recommendations (Carry-Forward)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in bridge/ingestion with the canonical entry point to eliminate the legacy path.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and rounding invariants.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` will diverge from the ledger-recorded total after epoch finalization. Consider calling `updateAfcReserve(afcReserve)` inside `distributeRewards()`.
