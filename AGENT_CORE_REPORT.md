# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-rZpll`  
**Date:** 2026-05-14  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or rewrite code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Content | Action |
|------|---------|--------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index, example | ✅ Confirmed correct |
| `aro_emission_protocol.md` | Canonical flow: mint → fee split → burn | ✅ Confirmed correct |
| `payment_distribution.md` | 75/25 split: 75% nodes, 25% AFC reserve | ✅ Confirmed correct |
| `burn_and_mint_rules.md` | General burn-on-withdrawal policy; non-contradictory | ✅ No change |
| `burn_mechanism.md` | Burn mechanics documentation | ✅ No change |
| `README.md` | Architecture overview; no formula conflicts | ✅ No change |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in this folder.

### src/token/ — Status: Canonical implementation confirmed ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Correct — defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented — see §3 below |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()`/`burn()` preserved for bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` delegates to `processReserve` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical implementation confirmed ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies canonical 75/25 split: `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy process-volume ledger; `reserveIndex` via `log1p` — used by `TokenomicsService.getCurrentPrice()` (legacy path) |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (rate defaults to `0.005`) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` — `NODE_SHARE_RATIO=0.75`, `AFC_SHARE_RATIO=0.25` |

**All seven canonical rules are implemented correctly. No code changes were required.**

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
  ├─ Ledger MINT:             emissionAmount → recipient           (step 1)
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL        (step 2a)
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE      (step 2b)
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000           (step 3)
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT  (step 4)

All four ledger steps are atomic — single QueryRunner transaction.
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out in same cycle)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.000035...
  → every subsequent emission is priced higher
```

---

## 5. Invariants (Enforced in Code)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on `amount ≤ 0`
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing — only `+=` to `totalReserve`, `sqrt` is non-negative
5. All four ledger steps succeed or all roll back — single atomic `QueryRunner` transaction

---

## 6. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Sync epoch AFC contributions into `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.

---

## 7. Conclusion

The canonical 1:1 emission model is **fully and correctly implemented** in `src/token/emission.service.ts`. Documentation in `01_coin_engine/` is consistent with the code. No corrective changes were necessary in this audit pass.
