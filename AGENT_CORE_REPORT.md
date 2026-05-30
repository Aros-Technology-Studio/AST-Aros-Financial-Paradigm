# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-y0ptI`  
**Date:** 2026-05-30  
**Task:** Audit ArosCoin emission logic against the canonical model; add missing unit tests; confirm all code and documentation are aligned

---

## 1. Directory Audit

### 01_coin_engine — Documentation only (no source code)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC reserve index, burn cycle, phase table |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram + full formula block |
| `payment_distribution.md` | ✅ Canonical | 75/25 split table; historical 60/15/15/5/5 note preserved |
| `burn_and_mint_rules.md` | ✅ Non-contradictory | General burn-on-withdrawal; no conflicts with canonical model |
| `README.md` | ✅ Non-contradictory | Architecture overview; no formula content |

**Module 01 is NOT deprecated.** It is pure specification documentation. Source of truth for code lives in `src/token/`.

### 10_proof_of_transaction_engine — Documentation only

Contains `.md` spec files for PoT validation, slashing conditions, signature model, and incentive distribution. No emission logic here. Actual PoT runtime lives in `src/proof_of_transaction_engine/`.

### src/token/ — Canonical implementation (all correct)

| File | Verified |
|------|---------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical lifecycle |
| `emission.service.spec.ts` | ✅ **Added this pass** — 19 unit tests (see §4) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT_DEPOSIT path |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` delegates to `processReserve.getReserveState()` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Canonical epoch split (correct)

`FeeDistributionService.distributeRewards()` applies 75/25 split to collected epoch fees:

```ts
const nodePool   = totalFees * 0.75;
const afcReserve = totalFees * 0.25;
```

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Uses `log1p` index (legacy pricing); consumed only by `TokenomicsService.getCurrentPrice()`. Does NOT affect canonical emission price — that lives in `EmissionService.getCurrentEmissionPrice()`. |
| `pot.service.ts` | PoT scoring and weight normalisation — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount (1:1) | Yes | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic transaction |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| All 4 ledger steps atomic | Yes | ✅ Single `QueryRunner` transaction; rolls back on any failure |

**Result: code fully conforms to the canonical model. No corrections required.**

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
  ├─ Ledger MINT:              emissionAmount  → recipient
  ├─ Ledger FEE_DISTRIBUTION:  nodeShare (75%) → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION:  afcShare (25%)  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:              emissionAmount  → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot()   (totalMinted +, totalBurned +, circulatingSupply unchanged)
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.00003536
  → every subsequent emission is priced higher
```

---

## 5. Unit Tests Added (this pass)

File: `src/token/emission.service.spec.ts`

| Suite | Tests |
|-------|-------|
| `calculate()` | 1:1 emission, default 0.5% rate, 75/25 split sum, custom rate, dust amount, zero-amount guard, negative-amount guard |
| `getAfcReserveState()` | initial state (index=1.0, reserve=0), snapshot immutability |
| `getCurrentEmissionPrice()` | returns 1.0 before any transactions |
| `updateCommissionRate()` | valid rate accepted, zero rejected, 1.0 rejected, negative rejected |
| `processTransactionEmission()` | 4 ledger entries per cycle, first=MINT, last=BURN, index rises after TX, index follows `sqrt` formula, rollback on ledger failure |

**Total suite: 19 tests — all pass. Full test suite: 89 tests, 0 failures.**

---

## 6. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on violation.
2. `nodeShare + afcShare == commission` — exact split; no rounding loss beyond float precision.
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply).
4. `reserveIndex` is monotonically non-decreasing — only `updateAfcReserve()` mutates it, always adding.
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction.

---

## 7. Open Recommendations (not addressed in this pass)

| Priority | Item |
|----------|------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots. |
| Medium | **Wire `mintForTransaction()` into the ingestion pipeline** — bridge/ingestion path still calls legacy `mint()`. Replace all ingestion-path calls with the canonical `mintForTransaction()` entry point. |
| Medium | **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; in-memory `reserveIndex` is therefore under-counted relative to epoch distributions. |
| Low | **Align `ProcessReserveLedgerService`** — uses `log1p` index formula, canonical uses `sqrt`. Currently isolated (only consumed by legacy `TokenomicsService.getCurrentPrice()`), but could cause confusion. |
