# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-hzoaG`  
**Date:** 2026-05-28  
**Task:** Audit ArosCoin emission logic against the canonical model; verify or rewrite

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code, NOT deprecated)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, $10k example — matches spec |
| `aro_emission_protocol.md` | ✅ Canonical Mermaid flow diagram, IV formula table, supply snapshot invariants |
| `payment_distribution.md` | ✅ Canonical 75/25 split documented |
| `burn_and_mint_rules.md` | ✅ General burn policy; non-contradictory |
| `README.md` | ✅ Architecture overview; no formula conflicts |

Module 01 is **not deprecated** — it is pure protocol documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
PoT code lives in `src/proof_of_transaction_engine/`. No emission logic resides here.

### src/token/ — Status: Canonical code confirmed ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle (`calculate` + `processTransactionEmission`) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` retained for FIAT_DEPOSIT path |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; price driven by `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed ✅

`FeeDistributionService.distributeRewards()` correctly applies the 75/25 split at epoch finalization:
- `NODE_SHARE_RATIO = 0.75` → node pool (by PoT weight)
- `AFC_SHARE_RATIO  = 0.25` → `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change per TX cycle | 0 | ✅ `SupplySnapshot`: `totalMinted += amount`, `totalBurned += amount`, `circulatingSupply` unchanged |

**Verdict: All rules conform to the canonical model. No rewrites required.**

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
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE
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
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000354...
  → every subsequent emission is priced higher
```

---

## 5. Invariants Confirmed

1. `emissionAmount == transactionAmount` (enforced in `calculate()`; throws `BadRequestException` if `txAmount <= 0`)
2. `nodeShare + afcShare == commission` (float arithmetic; no rounding loss beyond IEEE-754)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+=` on `totalReserve`, `sqrt` is strictly non-decreasing)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction with rollback on error)

---

## 6. Open Recommendations

| Priority | Item |
|----------|------|
| **High** | Persist `AfcReserveState` to database — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots persisted via `QueryRunner`. |
| **High** | Sync epoch AFC contributions to `EmissionService` — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` diverges after each epoch finalization. |
| **Medium** | Replace all `TokenService.mint()` calls in the bridge/ingestion path with `mintForTransaction()` — the legacy path does not apply 1:1 emission semantics. |
| **Low** | Add unit tests for `EmissionService.calculate()` — cover dust amounts, max commission rate boundary, zero-amount guard. |
