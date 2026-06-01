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

## 2. Bugs Found and Fixed

### 2.1 Ledger Deficit in Burn Step (emission.service.ts)

**Root cause:** `EmissionService.processTransactionEmission()` Step 4 was burning `result.emissionAmount`
(the full 10,000 ARO). By Step 4, the recipient had already paid commission in Steps 2a/2b,
leaving only `emissionAmount − commission = 9,950 ARO`. Burning 10,000 from a balance of
9,950 creates a **ledger deficit of −50 ARO per transaction**.

**Corrected accounting ($10,000 TX, 0.5% commission):**

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

**Fix:** Added `burnAmount = emission − commission` to `EmissionResult`; Step 4 burns `burnAmount` instead of `emissionAmount`; `updateSupplySnapshot()` corrected accordingly.

### 2.2 Missing Canonical HTTP Endpoint (token.controller.ts)

**Root cause:** `TokenController` only exposed `POST /api/v1/token/mint` (legacy path via `TokenService.mint()`) which bypasses the canonical 1:1 emission lifecycle entirely. No HTTP caller could reach `mintForTransaction()`.

**Fix:** Added two new endpoints:
- `POST /api/v1/token/emit` — canonical emission entry point
- `GET /api/v1/token/emission/price` — AFC reserve state and price index

### 2.3 Wrong Price Source in TokenomicsService (tokenomics.service.ts)

**Root cause:** `TokenomicsService.getCurrentPrice()` returned the **logarithmic** index from `ProcessReserveLedgerService` (`1.0 + log1p(totalVolume) / 100`), not the **canonical AFC sqrt** index from `EmissionService` (`1.0 + sqrt(totalAfcReserve) / 10_000`). Two different calculations over two different datasets — any caller reading price got a non-canonical value.

**Fix:** `tokenomics.service.ts` now injects `EmissionService` (via `forwardRef`) and delegates `getCurrentPrice()` to `EmissionService.getCurrentEmissionPrice()`.

---

## 3. Directory Audit

### 01_coin_engine — Status: Documentation only, NOT deprecated

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram: MINT→FEE×2→BURN |
| `payment_distribution.md` | ✅ Canonical | 75/25 split; historical 60/15/15/5/5 noted and superseded |
| `burn_and_mint_rules.md` | ✅ Patched | Added §0 documenting automatic 1:1 transient burn cycle with correct `burnAmount = emission − commission` |
| `README.md` | ✅ Non-contradictory | Architecture overview |
| `AROS_Coin_TokenSpec.json` | ✅ Present | Machine-readable spec |

**Module 01 is pure documentation.** The canonical source-of-truth code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Fixed and canonical ✅

| File | Pre-patch state | Post-patch state |
|------|----------------|-----------------|
| `emission.interfaces.ts` | Missing `burnAmount` | ✅ Added `burnAmount: number` |
| `emission.service.ts` | Burns `emissionAmount` (deficit bug) | ✅ Burns `burnAmount = emissionAmount − commission` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to EmissionService | ✅ Unchanged |
| `token.controller.ts` | ❌ No canonical endpoint; only legacy `mint()` | ✅ Added `POST /emit` + `GET /emission/price` |
| `tokenomics.service.ts` | ❌ `getCurrentPrice()` = log1p index from ProcessReserve | ✅ Delegates to `EmissionService.getCurrentEmissionPrice()` |
| `token.module.ts` | Minor ordering | ✅ Cleaned up; `EmissionService` declared before `TokenomicsService` |

### src/fee_distribution/ — Status: Canonical, fully compliant ✅

`FeeDistributionService.distributeRewards()` applies the canonical 75/25 split at epoch level:
- 75% → node pool (divided by PoT-normalized weight per active validator node)
- 25% → `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | PoT scoring `S_i = α·|TX_i| + β·F_i − δ·P_i`; weight normalization; role assignment |
| `process_reserve.service.ts` | Legacy process-volume ledger; log1p index — used only by legacy path |

---

## 4. Canonical Model Verification Matrix (post-patch)

| Rule | Canonical | Code location | Status |
|------|-----------|--------------|--------|
| `emission = transactionAmount` | 1:1 | `EmissionService.calculate()` | ✅ |
| `commission = transactionAmount × rate` | default 0.5% | `EmissionService.calculate()` | ✅ |
| `nodeShare = commission × 0.75` | 75% | `EmissionService.calculate()` | ✅ |
| `afcShare = commission × 0.25` | 25% | `EmissionService.calculate()` | ✅ |
| `burnAmount = emissionAmount − commission` | Correct balance | `EmissionService.calculate()` | ✅ Fixed |
| ARO burn after TX | Atomic with mint | `EmissionService.processTransactionEmission()` Step 4 | ✅ Fixed |
| AFC reserve grows → price rises | `1.0 + sqrt(R) / 10_000` | `EmissionService.updateAfcReserve()` | ✅ |
| Epoch fees also 75/25 | Yes | `FeeDistributionService.distributeRewards()` | ✅ |
| HTTP canonical endpoint | `POST /api/v1/token/emit` | `TokenController` | ✅ Added |
| `getCurrentPrice()` = AFC sqrt index | Single source of truth | `TokenomicsService` → `EmissionService` | ✅ Fixed |

---

## 5. Implementation Architecture

```
POST /api/v1/token/emit
  └─ TokenService.mintForTransaction()
       └─ EmissionService.processTransactionEmission(txAmount, recipient, refId, rate?)
            │
            ├─ calculate():
            │    emissionAmount = txAmount            // 1:1
            │    commission     = txAmount × rate     // 0.5% default
            │    nodeShare      = commission × 0.75
            │    afcShare       = commission × 0.25
            │    burnAmount     = emission − commission
            │
            ├─ Ledger MINT:             emissionAmount → recipient
            ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
            ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
            ├─ updateAfcReserve(afcShare):
            │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
            ├─ Ledger BURN:             burnAmount → SYSTEM_BURN_VAULT
            └─ updateSupplySnapshot():
                 totalMinted   += emissionAmount
                 totalBurned   += burnAmount
                 circulatingSupply += commission   (net: only commission stays in circulation)
```

All steps execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 6. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
burnAmount     = 10,000 − 50 = 9,950 ARO  (recipient's remaining balance, burned)

Supply impact:
  totalMinted       += 10,000
  totalBurned       +=  9,950
  circulatingSupply +=     50  (node pool + AFC reserve remain)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → next emission is priced higher
```

---

## 7. Files Changed in This Pass

| File | Change |
|------|--------|
| `src/token/emission.interfaces.ts` | Added `burnAmount: number` to `EmissionResult` |
| `src/token/emission.service.ts` | `calculate()` computes `burnAmount`; Step 4 burns `burnAmount`; supply snapshot tracks `burnAmount` |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` and `GET /api/v1/token/emission/price` |
| `src/token/tokenomics.service.ts` | `getCurrentPrice()` delegates to `EmissionService.getCurrentEmissionPrice()` |
| `src/token/token.module.ts` | Provider ordering cleanup |
| `01_coin_engine/burn_and_mint_rules.md` | Added §0 documenting automatic transient burn with correct `burnAmount` |
| `AGENT_CORE_REPORT.md` | This document |

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add `AfcReserveEntity` table with periodic snapshots or rebuild from ledger on startup.
- **Replace `mint()` calls in bridge/ingestion pipeline** with canonical `mintForTransaction()` — the legacy `mint()` does not apply commission splitting or correct burn.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, and invariant: `nodeShare + afcShare === commission`.
- **Sync epoch AFC to `EmissionService`** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; in-memory index only updates on per-TX emissions, not on epoch finalization.
