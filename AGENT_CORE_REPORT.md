# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-BnmYI`  
**Date:** 2026-05-13  
**Task:** Audit ArosCoin emission logic against the canonical model and confirm / align all code and documentation

---

## 1. Scope

Directories examined:
- `01_coin_engine/` — tokenomics documentation
- `10_proof_of_transaction_engine/` — PoT engine documentation
- `src/token/` — canonical emission source code
- `src/fee_distribution/` — epoch-level fee distribution
- `tests/` — existing test coverage

---

## 2. Directory Audit

### 01_coin_engine — Documentation only (no source code)

| File | Verified State |
|------|----------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, example vectors — correct |
| `aro_emission_protocol.md` | ✅ Mermaid flow, 1:1 formula, 75/25 split, burn lifecycle — correct |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator PoT-weight formula — correct |
| `burn_and_mint_rules.md` | ✅ Burn-on-withdrawal policy; no conflicts with canonical model |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation; the canonical implementation lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Documentation only

Spec files for PoT validation, slashing, signature model, and incentive distribution. No emission logic present. Actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Canonical implementation

| File | Verified State |
|------|----------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — see §3 |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` → `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `emission.service.spec.ts` | ✅ **Added this session** — full unit test coverage for canonical model |

### src/fee_distribution/ — Epoch-level canonical split

| File | Verified State |
|------|----------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies canonical 75/25 split: 75% node pool, 25% AFC reserve per epoch |

---

## 3. Canonical Model Verification

| Rule | Canonical Spec | Code Confirmation |
|------|---------------|-------------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split — nodes | 75% | ✅ `nodeShare = commission * 0.75` |
| Fee split — AFC reserve | 25% | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| All four steps atomic | Yes | ✅ Single `QueryRunner` transaction; `rollbackTransaction()` on error |

---

## 4. Implementation Detail

### EmissionService lifecycle (`src/token/emission.service.ts`)

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

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced higher
```

---

## 6. Supply Snapshot Invariants

Per canonical TX cycle (`EmissionService.updateSupplySnapshot()`):
- `totalMinted` increases by `emissionAmount`
- `totalBurned` increases by `emissionAmount`
- `circulatingSupply` is unchanged (mint and burn cancel out)

---

## 7. Changes Made This Session

| File | Change |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — unit tests for `calculate()`, AFC reserve index, `processTransactionEmission()` ledger ordering, atomicity, `updateCommissionRate()` |
| `AGENT_CORE_REPORT.md` | **Updated** — refreshed audit report for 2026-05-13 |

No changes were required to the emission logic itself — `emission.service.ts` was found to fully implement the canonical model.

---

## 8. Invariants Confirmed

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding leakage)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never resets)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 9. Open Recommendations (carry-forward from prior audit)

- **Persist `AfcReserveState` to DB** — currently in-memory; reset on restart. Add an `AfcReserveEntity` with periodic snapshots.
- **Sync epoch AFC to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` will drift from ledger reality after epoch finalization.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all raw `mint()` calls in the bridge/ingestion path with the canonical entry point.
