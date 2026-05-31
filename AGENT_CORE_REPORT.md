# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-mWxZN`  
**Date:** 2026-05-31  
**Task:** Full audit of ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (correct)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Mermaid sequence, canonical formula, allocation flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split, PoT-weight validator formula |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: 1 divergence fixed this pass

| File | Pre-patch | Action |
|------|-----------|--------|
| `pot_tx_incentive_distribution.md` | ❌ 60% validators / 30% attesters / 10% burn | **Fixed** → canonical 75% node pool / 25% AFC reserve |
| All other `.md` files | ✅ PoT scoring, slashing, signature model | Unchanged |

Actual PoT engine code lives in `src/proof_of_transaction_engine/`.

---

### 08_fee_distribution — Status: 2 divergences fixed this pass

| File | Pre-patch | Action |
|------|-----------|--------|
| `epoch_allocation_model.md` | ❌ 60/25/10/5 four-way allocation slices | **Fixed** → canonical 75/25, with note about superseded model |
| `emission_flow_pipeline.md` | ❌ "60% confirming node / 40% treasury" example | **Fixed** → canonical 75% node pool / 25% AFC reserve |

---

### 03_token_management_layer — Status: 1 divergence fixed this pass

| File | Pre-patch | Action |
|------|-----------|--------|
| `token_issuance_protocol.md` | ❌ Wrong formula `(fee * ratio) * node_weight`; 60/25/10/5 split | **Fixed** → canonical 1:1 formula; 75/25 split |
| All other `.md` files | ✅ Supply governance, burn mechanism, lock rules | Unchanged |

---

### src/token/ — Status: All canonical code confirmed correct

| File | State |
|------|-------|
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — `calculate()` + `processTransactionEmission()` |
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge backward-compat |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; `getCurrentPrice()` reads AFC reserve index |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.service.spec.ts` | ✅ Mock `EmissionService` wired; tests cover mint/burn lifecycle |

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

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 6. Divergences Found and Fixed in This Pass (2026-05-31)

| File | Divergence | Fix Applied |
|------|-----------|-------------|
| `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md` | 60% validators / 30% attesters / 10% burn | Updated to canonical 75/25 + historical note |
| `08_fee_distribution/epoch_allocation_model.md` | 60/25/10/5 four-way allocation slices | Updated to canonical 75/25 + historical note |
| `08_fee_distribution/emission_flow_pipeline.md` | "60% confirming node / 40% treasury" | Updated to canonical 75/25 + historical note |
| `03_token_management_layer/token_issuance_protocol.md` | Wrong `(fee*ratio)*node_weight` formula; 60/25/10/5 split | Updated to canonical 1:1 formula + 75/25 split |

**No source code changes were required** — `src/token/emission.service.ts` already implements the full canonical model correctly.

---

## 7. Previous Pass (2026-05-12) Changes Still in Effect

| File | Change from previous pass |
|------|--------------------------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split |

---

## 8. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — `ingestion.service.ts` has a commented-out `tokenService.mint()` call; replace with `mintForTransaction()` when ingestion is activated.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard, and 75/25 split invariant.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization.
