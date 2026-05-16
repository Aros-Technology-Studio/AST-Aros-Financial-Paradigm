# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-ncZDe`  
**Date:** 2026-05-16  
**Task:** Full audit of ArosCoin emission logic against the canonical model; confirm or rewrite code; add unit tests

---

## 1. Audit Scope

| Directory / File | Role |
|-----------------|------|
| `01_coin_engine/` | Documentation only — canonical spec |
| `10_proof_of_transaction_engine/` | Documentation only — PoT spec |
| `src/token/` | **Canonical source code** |
| `src/fee_distribution/` | Epoch-level fee distribution |
| `src/proof_of_transaction_engine/` | PoT scoring + legacy process-reserve |

---

## 2. Directory Audit Results

### 01_coin_engine — Status: Documentation, fully aligned ✅

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC index, burn cycle, example |
| `aro_emission_protocol.md` | ✅ Canonical protocol with mermaid sequence diagram |
| `payment_distribution.md` | ✅ 75/25 canonical split; historical note explaining old 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ✅ Non-contradictory general burn policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only ✅

Contains `.md` spec files (validation logic, incentive distribution, signature model, etc.).  
No emission logic resides here. Actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code verified ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all canonical |
| `emission.service.ts` | ✅ Full 1:1 lifecycle: MINT → FEE_DIST(75%) → FEE_DIST(25%) → updateAfcReserve → BURN |
| `token.service.ts` | ✅ `mintForTransaction()` delegates cleanly to `EmissionService` |
| `token.service.ts` (legacy) | ⚠️ `mint()` preserved for fiat-deposit flows — see §4 |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; `getCurrentPrice()` noted as secondary |
| `token.module.ts` | ✅ `EmissionService` registered and exported |
| `emission.service.spec.ts` | ✅ **NEW** — added in this pass (see §5) |

### src/fee_distribution/ — Status: Canonical ✅

`FeeDistributionService.distributeRewards()` applies 75/25 split at epoch level:
- 75% → `SYSTEM_NODE_POOL` (then subdivided by PoT weight per node)
- 25% → `SYSTEM_AFC_RESERVE`

### src/proof_of_transaction_engine/ — Status: Correct, separate concern ✅

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy process-volume ledger; drives `TokenomicsService.getCurrentPrice()` via `log1p` index. Not part of canonical emission path. |
| `pot.service.ts` | PoT score calculation and weight normalization — correct, untouched |

---

## 3. Canonical Model Verification Table

| Canonical Rule | Expected | Code State |
|---------------|----------|-----------|
| Emission = TX Amount | 1:1 (no multiplier) | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completes | Yes | ✅ BURN ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| All 4 ledger ops atomic | Yes | ✅ QueryRunner transaction with rollback on failure |
| Epoch fees also split 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

**Result: code fully matches the canonical model. No rewrites required.**

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL (75%)
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE (25%)
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot():
       totalMinted += emissionAmount
       totalBurned += emissionAmount
       circulatingSupply unchanged (net zero)
```

All five steps execute atomically inside a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### Legacy `mint()` — FIAT deposit flow (non-canonical ARO emission)

`TokenService.mint()` exists for fiat-deposit operations (bridge → fiat → ARO). It does **not** burn, does not split fees, and does not update the AFC reserve index — because it models a different economic event: depositing fiat and receiving a corresponding ARO balance.

This is intentional and correct; it is **not** the canonical emission path. The canonical path is `mintForTransaction()` → `EmissionService.processTransactionEmission()`.

Risk: callers must invoke `mintForTransaction()` for ARO emission events, not `mint()`. Any accidental call to `mint()` would bypass the burn and fee-split, permanently inflating supply.

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Unit Tests Added (`src/token/emission.service.spec.ts`)

Added in this pass — covering the previously open recommendation:

| Test group | Coverage |
|-----------|---------|
| `calculate()` | 1:1 emission, default rate, 75/25 split, custom rate, dust amounts, zero/negative guard |
| `getAfcReserveState()` | Initial state (index=1.0, reserve=0) |
| `getCurrentEmissionPrice()` | Initial = 1.0 |
| `updateCommissionRate()` | Valid range (0,1), boundary rejects |
| `processTransactionEmission()` | 4 ledger calls in correct order, correct amounts, correct addresses, AFC index grows, rollback on ledger failure |

---

## 7. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split, verified by tests)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases as reserve grows)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 8. Open Recommendations

| Priority | Item | Status |
|----------|------|--------|
| HIGH | **Persist `AfcReserveState` to DB** — currently in-memory; lost on restart. Add `AfcReserveEntity` table with periodic snapshots. | Open |
| MEDIUM | **Sync epoch AFC to EmissionService** — `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`. The in-memory index does not reflect epoch-level AFC contributions. | Open |
| MEDIUM | **Rename or guard legacy `mint()`** — rename to `mintFiatDeposit()` or add runtime guard to prevent accidental canonical misuse. | Open |
| LOW | **Populate `tests/test_emission.py`** — file exists but is empty. Either add Python property-based tests or delete if the TS spec covers the need. | Open |

---

## 9. Conclusion

The canonical 1:1 emission model is **fully and correctly implemented** in `src/token/emission.service.ts`.  
All documentation in `01_coin_engine/` is aligned with the canonical model.  
`10_proof_of_transaction_engine/` contains only specification docs; no code or emission logic.  
Module 01 is **not deprecated**.

This pass adds unit tests for `EmissionService` and updates this report to reflect the 2026-05-16 audit.
