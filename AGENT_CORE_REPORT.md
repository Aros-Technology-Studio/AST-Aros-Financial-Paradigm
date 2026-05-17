# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-05-17  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation; add missing tests

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid sequence diagram, invariants, kill-switch |
| `payment_distribution.md` | ✅ Canonical | 75/25 split documented |
| `burn_and_mint_rules.md` | ✅ Compatible | General burn-on-withdrawal; no contradictions |
| `README.md` | ✅ Compatible | Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, and incentive distribution.  
No emission logic here. Actual PoT code: `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified State |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct ratios |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic QueryRunner; all 4 ledger steps |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge/fiat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to reserve index; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.service.spec.ts` | ✅ Covers `mint`, `burn`, rollback paths for `TokenService` |
| `emission.service.spec.ts` | ✅ Added this pass — covers `calculate()`, `processTransactionEmission()`, AFC index |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burns after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Net circulating supply change = 0 | Yes | ✅ `totalMinted == totalBurned` in `SupplySnapshot` per TX cycle |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` applies same split |
| All 4 steps atomic | Yes | ✅ Single `QueryRunner` transaction; rollback on any failure |

**Result: code fully matches canonical model. No rewrites required.**

---

## 3. Canonical Lifecycle Flow

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount            // 1:1
  │    commission     = txAmount × 0.005   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
       └─ updateSupplySnapshot() → totalMinted++, totalBurned++, circulatingSupply unchanged
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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)

Net circulating change = 0  (mint and burn cancel out)

After 12.50 AFC accumulated (first TX):
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.00003536...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on negative/zero input
2. `nodeShare + afcShare == commission` — exact floating-point split (no rounding loss beyond IEEE 754)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing — `sqrt` is always positive; `totalReserve` only ever increases
5. All four ledger steps succeed or all roll back — guaranteed by `QueryRunner` atomicity
6. `commissionRate` must satisfy `0 < rate < 1` — enforced in `updateCommissionRate()`

---

## 6. Changes Made in This Pass

| File | Action |
|------|--------|
| `AGENT_CORE_REPORT.md` | Updated with 2026-05-17 audit results; added test coverage section |
| `src/token/emission.service.spec.ts` | **Created** — unit tests for `calculate()` and `processTransactionEmission()` |

Documentation and code were already canonical. No formula rewrites needed.

---

## 7. Open Recommendations (carry-over from prior pass)

| Priority | Item |
|----------|------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; lost on process restart. Add `AfcReserveEntity` with periodic snapshots. |
| Medium | **Sync epoch AFC to `EmissionService`** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; in-memory index diverges after epoch finalization. |
| Low | **Wire `mintForTransaction()` into all ingestion paths** — replace remaining `mint()` calls in bridge/ingestion with the canonical entry point. |
