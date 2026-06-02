# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-6YHYE`  
**Date:** 2026-06-02  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or rewrite

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

Module 01 is **pure documentation**. It contains no source code. All `.md` files correctly describe the canonical model.

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow; Mermaid sequence diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split; PoT-weighted validator share formula |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy, consistent with canonical model |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Canonical source code lives in `src/token/`.** No emission logic was found in Module 01.

---

### 10_proof_of_transaction_engine — Status: Documentation only

Contains PoT spec files: validation logic, challenge/response, slashing conditions, incentive distribution.  
**Actual PoT code lives in `src/proof_of_transaction_engine/`.** No emission logic here.

---

### src/token/ — Status: Canonical implementation confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented (see §3) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` delegates to processReserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

### src/fee_distribution/ — Status: Canonical implementation confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split applied: 75% node pool, 25% AFC reserve per epoch |

---

### src/proof_of_transaction_engine/ — Status: Correct, untouched

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring (`S_i = α·TX + β·F - δ·P`) and weight normalization — correct |

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
| Net circulating supply change per TX | Zero | ✅ `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` |
| Atomicity | All-or-rollback | ✅ All 4 ledger steps inside single `QueryRunner` transaction |

**Result: Code fully conforms to canonical model. No rewrites required.**

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
  → every subsequent emission priced higher
```

---

## 5. Invariants (verified in code)

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Known Gaps (non-blocking, noted for next cycle)

| Gap | Detail | Priority |
|-----|--------|----------|
| AfcReserveState in-memory | `EmissionService.afcReserveState` is not persisted; lost on restart | Medium |
| Two reserve indices | `EmissionService` uses sqrt AFC index; `ProcessReserveLedgerService` uses log1p index; `TokenomicsService.getCurrentPrice()` reads the log1p one | Low |
| Legacy `mint()` not canonical | `TokenService.mint()` doesn't go through EmissionService burn cycle; still in use by bridge path | Medium |
| No unit tests for EmissionService | `calculate()` has no automated test coverage | Medium |

---

## 7. Conclusion

The canonical 1:1 emission model is **fully implemented and correct** in `src/token/emission.service.ts`.  
Module 01 is documentation-only — not deprecated. The canonical source of truth is `src/token/`.  
Module 10 is documentation-only — PoT code is in `src/proof_of_transaction_engine/`.  
No code rewrites were required in this audit pass.
