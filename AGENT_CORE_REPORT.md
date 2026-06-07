# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-zBIhc`  
**Date:** 2026-06-07  
**Task:** Audit ArosCoin emission logic against the canonical model, identify deviations, and enforce compliance

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no executable source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example |
| `aro_emission_protocol.md` | ✅ Canonical protocol with mermaid sequence diagram |
| `payment_distribution.md` | ✅ 75/25 node/AFC split documented |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy, no conflicts |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct by design.

### src/token/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC reserve update → burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` retained for bridge backward-compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads `reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Epoch fees split 75% → node pool, 25% → AFC reserve |

### src/bridge/ — Status: FIXED IN THIS PASS

| File | Finding | Action |
|------|---------|--------|
| `bridge.service.ts` → `handleFiatDepositWebhook()` | ❌ Called legacy `tokenService.mint()` — bypassed canonical emission | **Fixed** → now calls `mintForTransaction()` |

### src/token/token.controller.ts — Status: FIXED IN THIS PASS

| Endpoint | Finding | Action |
|----------|---------|--------|
| `POST /api/v1/token/mint` | ❌ Called legacy `tokenService.mint()` | **Fixed** → now calls `mintForTransaction()` |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code State |
|------|-----------|-----------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Bridge deposit path uses canonical emission | Yes | ✅ Fixed — now calls `mintForTransaction()` |
| HTTP `/mint` endpoint uses canonical emission | Yes | ✅ Fixed — now calls `mintForTransaction()` |

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
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split; no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero supply
4. `reserveIndex` is monotonically non-decreasing — only increases, never decreases
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/bridge/bridge.service.ts` | `handleFiatDepositWebhook()`: replaced `tokenService.mint()` with `tokenService.mintForTransaction()` (canonical path); updated `relatedTxHash` assignment to use `externalReference` |
| `src/token/token.controller.ts` | `POST /api/v1/token/mint`: replaced `tokenService.mint()` with `tokenService.mintForTransaction()` |
| `AGENT_CORE_REPORT.md` | This report — updated with 2026-06-07 findings |

---

## 7. Outstanding Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; state is lost on service restart. Add an `AfcReserveEntity` table with upsert on every `updateAfcReserve()` call.
- **Sync epoch AFC to `EmissionService.reserveIndex`** — `FeeDistributionService` records AFC reserve contributions on-ledger but does not call `EmissionService.updateAfcReserve()`. After each epoch finalization, the in-memory index should be re-synced so `getCurrentEmissionPrice()` reflects epoch-level accumulation.
- **Add unit tests for `EmissionService.calculate()`** — cover: dust amounts (< 0.01), max commission rate boundary (0.99999), zero-amount guard, and floating-point stability at large amounts (> 10^9).
- **Remove legacy `TokenService.mint()`** — now unreachable from all call sites. Safe to delete in a follow-up cleanup PR once the test suite is updated.
