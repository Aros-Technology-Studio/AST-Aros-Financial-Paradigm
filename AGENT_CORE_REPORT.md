# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-UmdI8`  
**Date:** 2026-06-03  
**Task:** Audit ArosCoin emission logic against the canonical model and confirm all code is aligned

> **Prior audit:** `claude/inspiring-cannon-4qbjK` (2026-05-12) — original alignment work landed in `agent/core-emission` → merged PR #72.  
> This report is a re-audit confirming the implementation remains canonical after subsequent merges.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Canonical compliance |
|------|---------------------|
| `coin_emission_model.md` | ✅ Describes 1:1 emission, AFC reserve index, burn flow |
| `aro_emission_protocol.md` | ✅ Canonical formulas: emission = txAmount, fee = txAmount × rate, 75/25 split |
| `payment_distribution.md` | ✅ Documents 75/25 node/AFC split |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy consistent with canonical model |
| `burn_mechanism.md` | ✅ Consistent with POST_TX_CANONICAL_BURN |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. All source code lives in `src/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle (230 lines) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a no-op; price delegates to `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code (emission.service.ts) | Status |
|------|-----------|---------------------------|--------|
| Emission = TX Amount | 1:1 | `emission = transactionAmount` (line 58) | ✅ |
| Fee = TX Amount × rate | default 0.5% | `commission = transactionAmount * rate` (line 59) | ✅ |
| Fee split: 75% nodes | Yes | `nodeShare = commission * 0.75` (line 60) | ✅ |
| Fee split: 25% AFC reserve | Yes | `afcShare = commission * 0.25` (line 61) | ✅ |
| ARO burn after TX | Yes | `BURN` ledger entry for `emissionAmount` (line 138–146) | ✅ |
| AFC reserve grows → price rises | Yes | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` (line 175–176) | ✅ |
| Epoch fees also 75/25 | Yes | `FeeDistributionService.distributeRewards()` (NODE_SHARE_RATIO=0.75) | ✅ |
| Atomicity | Required | Single `QueryRunner` transaction with rollback (lines 96–161) | ✅ |

**Result: Implementation fully matches the canonical model. No changes to source code required.**

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
  ├─ Ledger MINT:             emissionAmount → recipient            [line 102]
  ├─ Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL         [line 113]
  ├─ Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE       [line 124]
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000             [line 175]
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT    [line 138]
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### Deprecated Code

Only one deprecated method exists in the codebase:

- **`TokenomicsService.updateInternalValuation()`** (`src/token/tokenomics.service.ts`, line 47–51)  
  Marked `@deprecated` — is a confirmed no-op. Canonical price is driven by `EmissionService`.

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 ARO accumulated in AFC reserve:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on `amount <= 0`
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing — only increases via `sqrt` formula, never decreases
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Recommendations (carry-forward from prior audit)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace any remaining `mint()` calls in the bridge/ingestion path with the canonical entry point `mintForTransaction()`.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate (0.999), zero-amount guard, custom rate override.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`, so the in-memory `reserveIndex` diverges after epoch finalization. Consider a callback or event hook.
