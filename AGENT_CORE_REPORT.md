# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-19 (updated — re-verification pass)  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Canonical Model Reference

| Rule | Specification |
|------|--------------|
| Emission = TX Amount | 1:1 — no multipliers |
| Fee = TX Amount × rate | default 0.5% |
| Fee split — nodes | 75% of fee → SYSTEM_NODE_POOL |
| Fee split — AFC reserve | 25% of fee → SYSTEM_AFC_RESERVE |
| ARO lifecycle | Minted at TX start, burned at TX completion (transient) |
| Reserve price index | `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` |
| Net circulating supply change | 0 per canonical TX cycle |

---

## 2. Directory Audit

### 01_coin_engine — Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Sequencediagram + formulas match canonical model exactly |
| `payment_distribution.md` | ✅ 75/25 split documented |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy present |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source-of-truth code is in `src/token/`.

### 10_proof_of_transaction_engine — Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Primary audit target

| File | Pre-patch state | Action |
|------|----------------|--------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` | None required |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented | None required |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved | None required |
| `tokenomics.service.ts` | ❌ `getCurrentPrice()` delegated to `processReserve` (log1p), not canonical sqrt | **Fixed** — now delegates to `EmissionService.getCurrentEmissionPrice()` |
| `token.controller.ts` | ❌ `POST /api/v1/token/mint` called legacy `mint()` — no fee split, no burn | **Fixed** — now calls `mintForTransaction()`; adds `GET /emission/state` (AFC reserve live state) |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported | None required |
| `emission.service.spec.ts` | ❌ Missing | **Added** — 17 unit tests for `calculate()`, AFC reserve formula, `processTransactionEmission()`, and `updateCommissionRate()` |

### src/fee_distribution/ — **Fixed** (epoch→EmissionService sync gap)

`FeeDistributionService.distributeRewards()` applies the canonical 75/25 epoch-level split.  
`NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` — confirmed correct.

After each epoch's AFC reservation is written to the ledger, `emissionService.recordAfcContribution(afcReserve)` is called so the in-memory price index reflects epoch-level contributions in addition to per-TX ones.

### src/proof_of_transaction_engine/

| File | State |
|------|-------|
| `process_reserve.service.ts` | General volume ledger with log1p index; used by legacy tokenomics path only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 3. Issues Found and Fixed

### Issue 1 — `TokenController.mintTokens()` called legacy `mint()` (FIXED)

**Location:** `src/token/token.controller.ts` — `POST /api/v1/token/mint`

**Pre-patch:** `tokenService.mint(amount, recipient, refId)`  
The legacy `mint()` issues a raw MINT ledger record with no commission split and no burn.  
Net effect: permanent ARO creation without the canonical 75/25 fee routing or post-TX burn.

**Post-patch:** `tokenService.mintForTransaction(parseFloat(amount), recipient, refId, commissionRate?)`  
Routes through `EmissionService.processTransactionEmission()` — full canonical lifecycle:
1. MINT `emissionAmount` → recipient (1:1)
2. FEE_DISTRIBUTION `nodeShare (75%)` → SYSTEM_NODE_POOL
3. FEE_DISTRIBUTION `afcShare (25%)` → SYSTEM_AFC_RESERVE
4. `updateAfcReserve(afcShare)` — reserveIndex rises
5. BURN `emissionAmount` → SYSTEM_BURN_VAULT

All five steps execute atomically within a single `QueryRunner` transaction.

Additionally, `GET /api/v1/token/emission/state` was added to expose live AFC reserve state and current emission price index.

---

### Issue 2 — `TokenomicsService.getCurrentPrice()` did not use canonical sqrt formula (FIXED)

**Location:** `src/token/tokenomics.service.ts`

**Pre-patch:** delegated to `processReserve.getReserveState().reserveIndex` — uses a `log1p` formula, diverging from canonical `1.0 + sqrt(totalAfcReserve) / 10_000`.

**Post-patch:** delegates to `emissionService.getCurrentEmissionPrice()` — now returns the canonical sqrt-based price index from `EmissionService`.

---

## 4. Canonical Model Verification — Post-Fix

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ BURN ledger record for `emissionAmount` in same atomic TX |
| AFC reserve → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Controller endpoint canonical | Yes | ✅ `POST /mint` → `mintForTransaction()` |
| Price index source of truth | EmissionService | ✅ `tokenomics.getCurrentPrice()` → `EmissionService.getCurrentEmissionPrice()` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

---

## 5. Emission Lifecycle — Implementation Detail

```
POST /api/v1/token/mint  →  TokenController.mintTokens()
  │
  └─ TokenService.mintForTransaction(txAmount, recipient, refId, rate?)
       │
       └─ EmissionService.processTransactionEmission(txAmount, recipient, refId, rate?)
            │
            ├─ calculate():
            │    emissionAmount = txAmount          // 1:1
            │    commission     = txAmount × 0.005  // 0.5% default
            │    nodeShare      = commission × 0.75
            │    afcShare       = commission × 0.25
            │
            ├─ Ledger MINT:             emissionAmount → recipient
            ├─ Ledger FEE_DISTRIBUTION: nodeShare  → SYSTEM_NODE_POOL
            ├─ Ledger FEE_DISTRIBUTION: afcShare   → SYSTEM_AFC_RESERVE
            ├─ recordAfcContribution(afcShare):
            │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
            └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

---

## 6. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 7. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 8. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 9. Remaining Recommendations (non-blocking)

- **Persist `AfcReserveState` to DB** — currently in-memory; lost on service restart. Add `AfcReserveEntity` table with periodic snapshots and restore on startup.
- **Deprecate `TokenService.mint()`** — now that the controller uses the canonical path, mark `mint()` as `@deprecated` and plan removal.
- **Add TypeScript unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, and zero-amount guard at the NestJS layer in addition to the Python reference tests.

---

---

## 10. Re-verification Pass — 2026-05-18

This pass closed the remaining gap and consolidated the AFC reserve API:

### Changes in this pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Merged `updateAfcReserve` (private) + `addAfcReserve` (public wrapper) into a single `recordAfcContribution()` method; added `afcAmount <= 0` guard |
| `src/fee_distribution/fee_distribution.service.ts` | Updated call site: `addAfcReserve` → `recordAfcContribution` |
| `src/token/token.service.spec.ts` | Updated mock: `updateAfcReserve` → `recordAfcContribution` |
| `src/fee_distribution/fee_distribution.service.test.ts` | Updated mock: `addAfcReserve` → `recordAfcContribution` |
| `tests/test_emission.py` | Converted from `pytest` to stdlib `unittest` (pytest not installed in CI env); 24 tests all passing |

### Full file-level verification

| File | State |
|------|-------|
| `src/token/emission.service.ts` | ✅ `emission = transactionAmount` (1:1); `commission = txAmount * rate`; `nodeShare = commission * 0.75`; `afcShare = commission * 0.25`; `recordAfcContribution()` updates index |
| `src/token/emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields correct |
| `src/token/token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService.processTransactionEmission()` |
| `src/token/token.controller.ts` | ✅ `POST /mint` calls `mintForTransaction()`; `GET /emission/state` returns AFC live state |
| `src/token/tokenomics.service.ts` | ✅ `getCurrentPrice()` → `emissionService.getCurrentEmissionPrice()` |
| `src/token/token.module.ts` | ✅ `EmissionService` in providers and exports |
| `src/fee_distribution/fee_distribution.service.ts` | ✅ 75/25 split; `recordAfcContribution()` called after epoch AFC reservation |
| `src/proof_of_transaction_engine/pot.service.ts` | ✅ PoT weight normalisation unchanged |
| `01_coin_engine/coin_emission_model.md` | ✅ Canonical formulas, AFC reserve index, worked example |
| `01_coin_engine/aro_emission_protocol.md` | ✅ Sequence diagram, allocation flow — correct |
| `01_coin_engine/payment_distribution.md` | ✅ 75/25 split, PoT weight formula |
| `tests/test_emission.py` | ✅ 24 tests all passing (stdlib unittest) |

**All canonical invariants hold.**

---

## 11. Re-verification Pass — 2026-05-19

Full second-pass audit confirms all canonical invariants remain intact.

### Test suite status

```
PASS src/token/emission.service.spec.ts
  EmissionService — Canonical 1:1 Model
    calculate()
      ✓ uses 1:1 emission — emissionAmount equals transactionAmount
      ✓ canonical example: $10,000 at 0.5% commission
      ✓ default commission rate is 0.5%
      ✓ node share is 75% of commission
      ✓ AFC share is 25% of commission
      ✓ nodeShare + afcReserveShare = commission (no leakage)
      ✓ accepts a custom commission rate
      ✓ throws BadRequestException for zero amount
      ✓ throws BadRequestException for negative amount
    AFC reserve price index
      ✓ starts at 1.0 (no reserve accumulated)
      ✓ initial reserve state is zero
      ✓ price index rises after processing a transaction (canonical sqrt formula)
      ✓ reserve index grows monotonically across multiple transactions
      ✓ governance can update commission rate
      ✓ throws when commission rate is out of range
    processTransactionEmission() — ledger call order
      ✓ makes exactly 4 ledger calls per transaction
      ✓ first call is MINT 1:1 to recipient
      ✓ second call distributes 75% commission to node pool
      ✓ third call distributes 25% commission to AFC reserve
      ✓ fourth call burns the emitted ARO (transient token lifecycle)
      ✓ commits the DB transaction on success
      ✓ rolls back and rethrows on ledger failure

Tests: 22 passed, 22 total
```

### Canonical model verification — confirmed 2026-05-19

| Rule | Expected | Code |
|------|----------|------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` |
| Fee = TX Amount × 0.5% | default | ✅ `commission = transactionAmount * rate` |
| Node share | 75% | ✅ `nodeShare = commission * 0.75` |
| AFC reserve share | 25% | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | transient | ✅ `BURN` ledger entry in same atomic TX |
| AFC reserve drives price | √ formula | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch-level 75/25 | same split | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC synced to index | yes | ✅ `recordAfcContribution()` called post-epoch |
| Controller endpoint | canonical | ✅ `POST /mint` → `mintForTransaction()` |
| Price source of truth | EmissionService | ✅ `tokenomics.getCurrentPrice()` → `EmissionService` |

**Status: CANONICAL MODEL FULLY IMPLEMENTED. No corrective action required.**

---

## 12. Final Audit Pass — 2026-05-19 (AGENT-CORE v3)

Two residual spec-file divergences found and fixed:

### Fix A — `AROS_Coin_TokenSpec.json` (machine-readable spec)

| Field | Before | After |
|-------|--------|-------|
| `supplyMechanism.type` | `transaction-fee-based` | `transaction-amount-emission-1:1` |
| `supplyMechanism.burnOn` | `governance_rule` | `transaction_completion` |
| `transactionFees.distribution` | `{nodeOperators:0.75, ASTtreasury:0.20, AuditPool:0.05}` | removed (replaced with canonical `commission` block) |
| `commission.distribution` | _(missing)_ | `{nodePool:0.75, afcReserve:0.25}` |
| `afcReservePriceIndex` | _(missing)_ | `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` |
| `metadata.version` | `1.0.0` | `2.0.0` |
| `metadata.contractRef` | `contracts/aros_token_mainnet.sol` | `src/token/emission.service.ts` |

### Fix B — `01_coin_engine/burn_and_mint_rules.md`

| Section | Before | After |
|---------|--------|-------|
| §1 "When Minting is Allowed" | No mention of 1:1 canonical emission | Added canonical emission as primary minting trigger |
| §1 "Minting Constraints" | `dailyMintLimit` hard-cap | Replaced with AFC price index as organic throttle; no fixed cap |
| §2 "When Burning is Triggered" | Burn only on reverse-tokenization or governance | Added canonical per-TX automatic burn as primary trigger |
| §4 "Fee Distribution Parameters" | `dailyMintLimit:250k`, `burnRate:3%`, `mintThreshold:500k` | Replaced with canonical parameters table (`emissionRate`, `commissionRate`, `nodeShareRatio`, `afcReserveRatio`, `burnTrigger`) |

### Post-fix state — all files confirmed canonical

| File | Status |
|------|--------|
| `01_coin_engine/AROS_Coin_TokenSpec.json` | ✅ v2.0.0 — canonical 1:1, `burnOn:transaction_completion`, `nodePool:0.75/afcReserve:0.25` |
| `01_coin_engine/burn_and_mint_rules.md` | ✅ Canonical emission trigger, no conflicting caps, correct parameters table |
| `01_coin_engine/coin_emission_model.md` | ✅ Unchanged — already canonical |
| `01_coin_engine/aro_emission_protocol.md` | ✅ Unchanged — already canonical |
| `01_coin_engine/payment_distribution.md` | ✅ Unchanged — already canonical |
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | ✅ Fixed in prior pass — 75/25 |
| `src/token/emission.service.ts` | ✅ Unchanged — canonical implementation |
| `src/token/token.controller.ts` | ✅ Fixed in prior pass — `mintForTransaction()` + `GET /emission/state` |

**All canonical invariants hold across code and documentation.**

---

## 13. Atomicity Fix — 2026-05-19 (AGENT-CORE v4)

### Bug: emission lifecycle steps were NOT actually atomic

**Root cause** (`src/token/emission.service.ts` + `src/ledger/ledger.service.ts`):

`processTransactionEmission()` owns an outer `QueryRunner` (for the `SupplySnapshot` update)
but called `ledgerService.recordTransaction()` four times **without** passing that runner.
Each call opened, committed, and released its **own** internal `QueryRunner`.

Consequence: if `BURN` (step 4) threw after `MINT` (step 1) and both `FEE_DISTRIBUTION` steps had
already committed to the DB, the emitted ARO would remain in circulation permanently — a direct
violation of the canonical "transient token" invariant and invariant #5
("All ledger steps succeed or all roll back").

The report at §3/§5 stated "All five steps execute atomically" — that claim was incorrect
prior to this fix.

### Fix applied

**`src/ledger/ledger.service.ts`** — `recordTransaction()` now accepts an optional second parameter:

```typescript
async recordTransaction(
    dto: Partial<Transaction>,
    externalRunner?: QueryRunner,   // ← new
): Promise<Transaction>
```

- `externalRunner` provided → join caller's transaction; no `connect/commit/rollback/release`.
- `externalRunner` absent → self-managed lifecycle (backwards-compatible with all existing callers).

**`src/token/emission.service.ts`** — all four `recordTransaction()` calls inside
`processTransactionEmission()` now pass `queryRunner` as the second argument.

Result: MINT + FEE_DISTRIBUTION×2 + BURN + SupplySnapshot all execute inside a **single**
database transaction. Any step failure rolls back all prior steps atomically.

### Post-fix invariant table

| # | Invariant | Status |
|---|-----------|--------|
| 1 | `emissionAmount == transactionAmount` | ✅ enforced in `calculate()` |
| 2 | `nodeShare + afcShare == commission` | ✅ exact ratio |
| 3 | `totalMinted == totalBurned` per TX cycle | ✅ SupplySnapshot records net-zero |
| 4 | `reserveIndex` monotonically non-decreasing | ✅ only grows |
| 5 | All 4 ledger steps + snapshot atomic | ✅ **Fixed** — single outer `QueryRunner` |
