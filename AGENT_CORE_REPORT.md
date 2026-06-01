# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-01  
**Task:** Audit ArosCoin emission logic against the canonical model; fix any divergence

---

## 1. Canonical Model Reference

| Rule | Specification |
|------|--------------|
| Emission | = Transaction Amount (1:1, no multiplier) |
| Commission (Fee) | = Transaction Amount × rate (default 0.5%) |
| Node Share | = Commission × 0.75 (75% → distributed to nodes by PoT weight) |
| AFC Reserve | = Commission × 0.25 (25% → locked in AFC reserve contract) |
| ARO lifecycle | Minted 1:1 at TX start; commission deducted; remainder burned on TX completion |
| Burn Amount | = emissionAmount − commission (recipient burns only what they still hold) |
| AFC Reserve Index | `1.0 + sqrt(totalAfcReserve) / 10_000` (monotonically rising) |

---

## 2. Bug Found and Fixed: Ledger Deficit in Burn Step

### Root cause

`EmissionService.processTransactionEmission()` Step 4 was burning `result.emissionAmount`
(the full 10,000 ARO). By Step 4, the recipient had already paid commission in Steps 2a/2b,
leaving only `emissionAmount − commission = 9,950 ARO`. Burning 10,000 from a balance of
9,950 creates a **ledger deficit of −50 ARO per transaction**.

### Corrected accounting ($10,000 TX, 0.5% commission)

```
Step 1 MINT  +10,000  → recipient          (1:1 emission)
Step 2a DIST   −37.5  → NODE_POOL          (75% of 50 ARO commission)
Step 2b DIST   −12.5  → AFC_RESERVE        (25% of 50 ARO commission)
             ────────
recipient balance: 9,950 ARO remaining

Step 4 BURN  −9,950  → BURN_VAULT          (burnAmount = 10,000 − 50)
             ────────
recipient balance: 0 ✓  (no deficit)

Supply impact per TX:
  totalMinted       += 10,000
  totalBurned       +=  9,950
  circulatingSupply +=     50  (commission stays in node pool + AFC reserve)
```

### Files changed in this pass

| File | Change |
|------|--------|
| `src/token/emission.interfaces.ts` | Added `burnAmount: number` to `EmissionResult` |
| `src/token/emission.service.ts` | `calculate()` computes `burnAmount = emission − commission`; Step 4 burns `burnAmount`; `updateSupplySnapshot()` tracks `totalBurned += burnAmount`, `circulatingSupply += commission` |
| `01_coin_engine/burn_and_mint_rules.md` | Added §0 — Canonical Per-Transaction Burn Cycle: documents the automatic transient burn (with correct `burnAmount = emission − commission`), distinct from the governance-level operations described in §1–§5 |
| `AGENT_CORE_REPORT.md` | This report |

---

## 3. Directory Audit

### 01_coin_engine — Status: Documentation only, NOT deprecated

All documentation files align with the canonical model:

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, worked example, all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram showing MINT→FEE×2→BURN flow |
| `payment_distribution.md` | ✅ Canonical | 75/25 split; historical 60/15/15/5/5 noted and superseded |
| `burn_and_mint_rules.md` | ✅ Patched | Added §0 documenting automatic 1:1 transient burn cycle with correct `burnAmount = emission − commission` |
| `README.md` | ✅ Non-contradictory | Architecture overview; no formula conflicts |
| `AROS_Coin_TokenSpec.json` | ✅ Present | Machine-readable spec |

**Module 01 is pure documentation.** The canonical source-of-truth code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic is defined here.

### src/token/ — Status: Fixed and canonical ✅

| File | Verified State |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult` now includes `burnAmount = emissionAmount − commission` |
| `emission.service.ts` | ✅ Fixed: `burnAmount` computed in `calculate()`; Step 4 burns `burnAmount`; supply snapshot corrected |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` (canonical path) |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; `getCurrentPrice()` preserved for legacy callers |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `entities/supply_snapshot.entity.ts` | ✅ Tracks `totalMinted`, `totalBurned`, `circulatingSupply` |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | PoT scoring `S_i = α·|TX_i| + β·F_i − δ·P_i`; weight normalization; role assignment — correct |
| `process_reserve.service.ts` | Legacy process-volume ledger; `log1p` index — used only by legacy tokenomics path. Does not affect canonical emission |

### src/fee_distribution/ — Status: Canonical, fully compliant ✅

`FeeDistributionService.distributeRewards()` applies the canonical 75/25 split at epoch level:
- 75% → node pool (divided by PoT-normalized weight per active validator node)
- 25% → `SYSTEM_AFC_RESERVE_000000000000000000`

---

## 4. Canonical Model Verification Matrix

| Rule | Canonical | Code location | Status |
|------|-----------|--------------|--------|
| `emission = transactionAmount` | 1:1 | `EmissionService.calculate()` | ✅ |
| `commission = transactionAmount × rate` | default 0.5% | `EmissionService.calculate()` | ✅ |
| `nodeShare = commission × 0.75` | 75% | `EmissionService.calculate()` | ✅ |
| `afcShare = commission × 0.25` | 25% | `EmissionService.calculate()` | ✅ |
| `burnAmount = emission − commission` | Yes | `EmissionService.calculate()` | ✅ **Fixed** |
| MINT ledger record (1:1 to recipient) | Yes | `processTransactionEmission()` Step 1 | ✅ |
| FEE_DISTRIBUTION nodeShare → NODE_POOL | Yes | `processTransactionEmission()` Step 2a | ✅ |
| FEE_DISTRIBUTION afcShare → AFC_RESERVE | Yes | `processTransactionEmission()` Step 2b | ✅ |
| AFC reserve update → index rises | Yes | `updateAfcReserve()`: `1.0 + sqrt(total)/10_000` | ✅ |
| BURN `burnAmount` (no ledger deficit) | Yes | `processTransactionEmission()` Step 4 | ✅ **Fixed** |
| All 4 steps atomic | Yes | Single `QueryRunner` transaction | ✅ |
| `circulatingSupply += commission` per TX | Yes | `updateSupplySnapshot()` | ✅ **Fixed** |
| `totalMinted − totalBurned == commission` | Yes | `updateSupplySnapshot()` | ✅ **Fixed** |
| Epoch-level 75/25 | Yes | `FeeDistributionService.distributeRewards()` | ✅ |
| `mintForTransaction()` as canonical entry | Yes | `TokenService.mintForTransaction()` | ✅ |

---

## 5. Implementation Detail (post-fix)

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount             // 1:1
  │    commission     = txAmount × rate      // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │    burnAmount     = emission − commission // avoids ledger deficit
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             burnAmount     → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot():
       totalMinted       += emissionAmount
       totalBurned       += burnAmount
       circulatingSupply += commission
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

## 6. Worked Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn Amount    =  9,950 ARO  (= 10,000 − 50; recipient burns what they hold)

Supply impact:
  totalMinted       += 10,000
  totalBurned       +=  9,950
  circulatingSupply +=     50  (commission stays in node pool + AFC reserve)

AFC reserve after this TX:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced higher
```

---

## 7. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on `txAmount <= 0`
2. `nodeShare + afcShare == commission` — exact 75/25, no rounding loss beyond float precision
3. `burnAmount == emissionAmount - commission` — recipient can always cover the burn (no deficit)
4. `totalMinted - totalBurned == commission` per TX cycle in `SupplySnapshot`
5. `circulatingSupply` grows by exactly `commission` per canonical TX cycle
6. `reserveIndex` monotonically non-decreasing (only `+=` on `totalReserve`, then sqrt)
7. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 8. Module 01 — Deprecated? Conclusion

**Module 01 is NOT deprecated.**  
Pure documentation module. Source code was never intended to live there.  
Canonical implementation: `src/token/emission.service.ts`.

---

## 9. Open Recommendations

| Priority | Item | Rationale |
|----------|------|-----------|
| High | Persist `AfcReserveState` to database | Currently in-memory; lost on restart. Add a dedicated entity with periodic snapshots. |
| Medium | Wire `mintForTransaction()` into bridge/ingestion | Legacy `mint()` in `token.service.ts` bypasses the canonical lifecycle. Replace all call sites. |
| Medium | Sync epoch AFC contribution to `EmissionService` | `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; in-memory index stays unsynced after epoch finalization. |
| Low | Add unit tests for `EmissionService.calculate()` | Cover `burnAmount` correctness, dust amounts, max commission rate boundary, zero-amount guard. |
| Low | Unify price index | `TokenomicsService.getCurrentPrice()` reads from `processReserve` (log1p); canonical price is `EmissionService.getCurrentEmissionPrice()` (sqrt). Deprecate the processReserve index path. |
| Low | Backfill `supply_snapshots` | Historical rows used old net-zero logic. A migration should add `+commission` to each historical `circulatingSupply` row. |

---

## 10. Re-verification Pass — 2026-06-01

Independent re-audit against the canonical model spec. All previously reported fixes confirmed present and correct:

| Check | Result |
|-------|--------|
| `burnAmount = emissionAmount − commission` in `calculate()` | ✅ Present |
| Step 4 burns `result.burnAmount` (not `result.emissionAmount`) | ✅ Correct |
| `updateSupplySnapshot()` increments `circulatingSupply += commission` | ✅ Correct |
| `EmissionResult.burnAmount` field defined in interfaces | ✅ Present |
| `FeeDistributionService` 75/25 split unchanged | ✅ Confirmed |
| `01_coin_engine/` docs aligned with canonical model | ✅ Confirmed |
| `burn_and_mint_rules.md` §0 canonical burn cycle documented | ✅ Patched |
| Module 01 deprecated? | ✅ NOT deprecated — pure docs |

No further code changes required.

---

## 11. Sign-off

Burn-amount ledger deficit bug identified and fixed in `src/token/emission.service.ts`.  
All canonical emission rules now correctly implemented.  
`burn_and_mint_rules.md` patched with §0 to document the automatic per-TX transient burn cycle.  
Documentation in `01_coin_engine/` is fully aligned.  
System is compliant with the canonical 1:1 emission model.
