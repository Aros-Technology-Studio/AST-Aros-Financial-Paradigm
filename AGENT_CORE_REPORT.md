# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-Pl5Rw`  
**Date:** 2026-05-19  
**Task:** Audit ArosCoin emission logic against the canonical model; verify code conformance; add missing unit tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical — describes 1:1 emission, 0.5% fee, 75/25 split, AFC reserve index, burn |
| `aro_emission_protocol.md` | ✅ Canonical — full mermaid lifecycle diagram, all formulas match |
| `payment_distribution.md` | ✅ Canonical — 75% node pool / 25% AFC reserve split |
| `burn_and_mint_rules.md` | ✅ Non-contradictory general burn policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code authority is `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution. No emission logic is implemented here; actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` fully typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — MINT → FEE 75% → FEE 25% → updateAfcReserve → BURN, all atomic |
| `emission.service.spec.ts` | ✅ **Added in this pass** — 18 unit tests covering calculate(), lifecycle, AFC index, rollback |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat bridge |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to processReserve; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| nodeShare + afcShare == commission | Yes | ✅ exact split (verified in spec) |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in same atomic transaction |
| Net circulating supply change = 0 | Yes | ✅ `circulatingSupply` unchanged in `SupplySnapshot`; only `totalMinted`/`totalBurned` grow |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| reserveIndex monotonically non-decreasing | Yes | ✅ only incremented, never decremented |
| All four steps atomic | Yes | ✅ single `QueryRunner` transaction; rollback on any failure |

---

## 3. Implementation Detail

### EmissionService lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount            // 1:1, no multiplier
  │    commission     = txAmount × rate     // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL_00000000000000000000
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE_000000000000000000
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT_00000000000000000000
  └─ updateSupplySnapshot(): totalMinted++, totalBurned++, circulatingSupply unchanged
```

All four ledger operations execute atomically within a single `QueryRunner` transaction; on any failure, `rollbackTransaction()` is called and the error is re-thrown.

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch close)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on zero/negative)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only grows as AFC reserve accumulates)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.spec.ts` | **Created** — 18 unit tests covering `calculate()`, fee split, lifecycle order, AFC index formula, rollback, supply snapshot net-zero |

---

## 7. Outstanding Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic snapshots and a startup restore path.
- **Wire `mintForTransaction()` into ingestion pipeline** — the bridge and ingestion paths still call the legacy `mint()` which does not follow the canonical model. Replace with `mintForTransaction()`.
- **Epoch AFC contribution sync** — `FeeDistributionService` records AFC reserve on ledger at epoch close but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` therefore lags after epoch-level fees. Consider a sync hook at epoch finalization.
- **Governance-constrained commission rate bounds** — `updateCommissionRate()` accepts any value in `(0, 1)`. The protocol should constrain this to a tighter range (e.g. 0.001–0.05) to prevent governance-approved runaway fees.
