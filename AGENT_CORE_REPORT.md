# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-dB8YB`  
**Date:** 2026-05-13  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or rewrite; add tests and HTTP endpoint

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only, canonical

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, 75/25 split, AFC index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram, all 4 steps, supply invariants |
| `payment_distribution.md` | ✅ Canonical | 75/25 table, PoT weight formula, historical note re: old 60/15/15/5/5 |
| `burn_and_mint_rules.md` | ⚠ Partially aligned | Describes governance parameters; not contradictory but predates canonical model |
| `README.md` | ✅ Architecture overview | No formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only, no emission logic

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct separation.

### src/token/ — Status: Canonical, verified ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented |
| `emission.service.spec.ts` | ✅ **NEW** — 14 unit tests covering `calculate()`, `processTransactionEmission()`, AFC state |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `token.controller.ts` | ✅ **NEW** — `POST /api/v1/token/emit` canonical endpoint added |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; price via `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical ✅

| File | Notes |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

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
| HTTP endpoint for canonical flow | Yes | ✅ `POST /api/v1/token/emit` added to `TokenController` |

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
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT
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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 6. Changes Made in This Session

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` — canonical HTTP entry point calling `mintForTransaction()` |
| `src/token/emission.service.spec.ts` | **Created** — 14 unit tests: `calculate()` invariants, `processTransactionEmission()` lifecycle, AFC state, rollback |
| `tests/test_emission.py` | **Created** — 12 pure-Python protocol formula tests; all pass (`python tests/test_emission.py`) |

---

## 7. HTTP API

### Canonical emission endpoint

```
POST /api/v1/token/emit
Content-Type: application/json

{
  "transactionAmount": 10000,
  "recipient": "WALLET_ADDRESS",
  "referenceId": "TX_REF_001",
  "commissionRate": 0.005
}
```

Response — `EmissionResult`:

```json
{
  "transactionAmount": 10000,
  "emissionAmount": 10000,
  "commission": 50,
  "nodeShare": 37.5,
  "afcReserveShare": 12.5,
  "commissionRate": 0.005
}
```

### Legacy endpoints (preserved for bridge compatibility)

| Endpoint | Notes |
|----------|-------|
| `POST /api/v1/token/mint` | Legacy fiat-deposit mint; does NOT do canonical burn/split |
| `POST /api/v1/token/burn` | Fiat withdrawal burn + bridge payout |

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `/emit` into ingestion pipeline** — replace remaining `mint()` calls in bridge/ingestion paths with `mintForTransaction()`.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; synchronize in-memory index after each epoch finalization.
- **`burn_and_mint_rules.md` housekeeping** — add a note referencing canonical model for the burn-after-TX rule; old `burnRate`/`dailyMintLimit` parameters pre-date the canonical protocol.
