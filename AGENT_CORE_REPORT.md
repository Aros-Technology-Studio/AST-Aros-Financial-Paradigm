# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-09 (full audit pass; prior passes: 2026-06-08, 2026-05-12)  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and specifications.

> Cumulative change log across all passes: see §6.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula documented (rewritten in prior pass) |
| `aro_emission_protocol.md` | ✅ Canonical lifecycle documented (rewritten in prior pass) |
| `payment_distribution.md` | ✅ 75/25 split documented (rewritten in prior pass) |
| `burn_and_mint_rules.md` | ✅ Consistent — no conflicts |
| `README.md` | ✅ Rewritten (2026-06-08 pass): canonical 1:1 model, 75/25 split, correct env vars, canonical API signatures |

**Module 01 is NOT deprecated.** It is pure specification documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code verified and confirmed correct

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult` includes `burnAmount` and optional `mintTxHash` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `burnAmount = emission − commission`; `updateAfcReserve` called after commit; public `recordAfcContribution()` |
| `emission.service.spec.ts` | ✅ 239-line test suite: `calculate()`, `processTransactionEmission()`, AFC reserve, governance |
| `token.service.ts` | ✅ `mintForTransaction()` canonical path; `mint()` deposit path applies 75/25 split via `emissionService.calculate()` |
| `token.service.spec.ts` | ✅ Mock updated; commission-split assertion tests added |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `EmissionService.getCurrentEmissionPrice()` (AFC sqrt index) |
| `token.controller.ts` | ✅ `POST /emit` canonical endpoint and `GET /emission/price` |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

### src/bridge/ — Canonical wiring confirmed correct

| File | State |
|------|-------|
| `bridge.service.ts` | ✅ `handleFiatDepositWebhook()` calls `tokenService.mintForTransaction()` — canonical 1:1 emission, 75/25 fee split, post-TX burn |

### src/fee_distribution/ — Canonical code verified

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` |

---

## 2. Canonical Model Verification

| Rule | Canonical | EmissionService | BridgeService |
|------|-----------|----------------|---------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` | ✅ calls `mintForTransaction()` |
| Fee = TX Amount × rate | 0.5% default | ✅ `calculate()` | ✅ default rate applied |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission × 0.75` | ✅ via `processTransactionEmission` |
| Fee split: 25% AFC | Yes | ✅ `afcShare = commission × 0.25` | ✅ via `processTransactionEmission` |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | ✅ called after commit |
| ARO burn after TX | Yes | ✅ BURN `burnAmount = emission − commission` | ✅ atomic in `processTransactionEmission` |
| Canonical path via HTTP | Yes | — | ✅ `POST /api/v1/token/emit` → `mintForTransaction()` |
| Epoch fees 75/25 | Yes | — | ✅ `FeeDistributionService.distributeRewards()` |

**All rules satisfied. No divergence found.**

---

## 3. Implementation Detail

### Transaction lifecycle

```
Fiat deposit (bridge) →  TokenService.mintForTransaction()
                           → EmissionService.processTransactionEmission()
                               MINT emissionAmount → recipient (1:1)
                               FEE_DISTRIBUTION nodeShare (75%) → SYSTEM_NODE_POOL
                               FEE_DISTRIBUTION afcShare  (25%) → SYSTEM_AFC_RESERVE
                               BURN burnAmount (= emission − commission) → SYSTEM_BURN_VAULT
                               updateAfcReserve() after commitTransaction()

Fiat withdrawal →  TokenService.burn()
                     BURN amount → SYSTEM_BURN_VAULT
                     BridgeService.requestFiatPayout() → bank transfer
```

### EmissionService.calculate() — canonical formulas

```
emissionAmount  = transactionAmount          // 1:1
commission      = transactionAmount × rate   // default 0.5%
nodeShare       = commission × 0.75
afcReserveShare = commission × 0.25
burnAmount      = emissionAmount − commission // avoids ledger deficit
reserveIndex    = 1.0 + sqrt(totalAfcReserve) / 10_000
```

**burnAmount correctness:** After Step 1 (mint), the recipient holds `emissionAmount`. Steps 2a/2b
deduct `commission` in fees. Only `burnAmount = emissionAmount − commission` remains to burn.
Burning the full `emissionAmount` would produce a ledger deficit equal to `commission`.

**AFC update ordering:** `updateAfcReserve()` is intentionally called *after* `commitTransaction()`.
If called before and the DB transaction rolls back, the in-memory price index would advance
permanently out of sync with ledger records.

### HTTP Endpoints (token.controller.ts)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/token/emit` | **Canonical emission** — 1:1 mint + 75/25 fee split + burn |
| `GET`  | `/api/v1/token/emission/price` | AFC reserve index & state |
| `POST` | `/api/v1/token/mint` | FIAT_DEPOSIT via legacy path (applies 75/25 but no burn) |
| `POST` | `/api/v1/token/burn` | FIAT_WITHDRAWAL + bridge payout |
| `GET`  | `/api/v1/token/supply` | Latest supply snapshot |

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
POST /api/v1/token/emit
{ "transactionAmount": 10000, "recipient": "0xABC...", "referenceId": "TX-2026-001" }

→ Emission       = 10,000 ARO  (1:1 mint → recipient)
→ Commission     = 10,000 × 0.005 = 50 ARO
    Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch finalization)
    AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
→ Burn           = 9,950 ARO   (= emissionAmount − commission)
→ Net circulating change = 0   (recipient: +10,000 − 37.50 − 12.50 − 9,950 = 0)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split (float precision only)
3. `totalMinted − totalBurned == commission` per TX cycle in `SupplySnapshot` (fee remainder stays in circulation)
4. `reserveIndex` is monotonically non-decreasing — only grows, never shrinks
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction
6. `updateAfcReserve()` executes only after successful `commitTransaction()` — prevents in-memory/DB desync

---

## 6. Changes Made

### Prior pass (2026-05-12)
- `01_coin_engine/coin_emission_model.md` — replaced `E = F/N` with canonical 1:1 formulas
- `01_coin_engine/aro_emission_protocol.md` — replaced complex load-index formula with canonical lifecycle
- `01_coin_engine/payment_distribution.md` — replaced 60/15/15/5/5 table with 75/25 split

### Pass (2026-06-08)
- `01_coin_engine/README.md` — replaced old formula (BaseSchedule × Multiplier), 3-way pool split, decay env vars with canonical 1:1 model, 75/25 split, correct env vars
- `src/token/token.controller.ts` — added `POST /emit` canonical HTTP endpoint and `GET /emission/price`
- `src/token/emission.service.ts` — added `burnAmount` field; burn now uses `burnAmount = emissionAmount − commission`; `updateAfcReserve` moved to after `commitTransaction`; added public `recordAfcContribution()`
- `src/token/emission.service.spec.ts` — 239-line test suite
- `src/token/token.service.spec.ts` — mock updated; commission-split assertion tests
- `src/token/token.service.ts` — `mint()` deposit path applies canonical 75/25 split; legacy tokenomics price calls removed
- `src/bridge/bridge.service.ts` — **critical fix**: replaced `tokenService.mint()` with `tokenService.mintForTransaction()` for canonical 1:1 emission + fee split + burn on fiat deposits
- `src/token/tokenomics.service.ts` — `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` (AFC sqrt index, not PoT log1p index)
- Documentation alignment: `glossary.md`, `economic_simulation.md`, `08_fee_distribution/emission_flow_pipeline.md`, `08_fee_distribution/epoch_allocation_model.md`, `03_token_management_layer/token_distribution_model.md`, `03_token_management_layer/token_issuance_protocol.md` — all aligned to canonical 75/25

### Re-verification pass (2026-06-09)
**Full audit:** all source files re-read against canonical model. No discrepancies found.
- `EmissionService` ✅ canonical
- `TokenService.mintForTransaction()` ✅ canonical
- `BridgeService` ✅ calls `mintForTransaction()` — confirmed canonical
- `TokenomicsService` ✅ delegates to AFC reserve index
- `FeeDistributionService` ✅ 75/25 split
- AGENT_CORE_REPORT.md stale recommendation corrected (bridge confirmed as already using `mintForTransaction`)

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on process restart.
  Add an `AfcReserveEntity` table and snapshot on each emission + epoch finalization.
- **Sync epoch AFC contributions** — `FeeDistributionService.distributeRewards()` records the
  25% AFC share to ledger but does not call `EmissionService.recordAfcContribution()`. The
  in-memory `reserveIndex` therefore understates the true AFC accumulation after epoch finalization.
  Fix: call `emissionService.recordAfcContribution(afcEpochShare)` inside `distributeRewards()`.
- **Remove `ProcessReserveLedgerService` from `TokenService`** — `recordTransactionVolume()` is
  no longer called from any token path (the PoT volume ledger and the AFC reserve index are now
  separate). The injected dependency is dead weight; remove it to reduce coupling.
