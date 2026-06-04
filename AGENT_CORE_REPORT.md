# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-SjBec`  
**Date:** 2026-06-04  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or rewrite as needed

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State | Action |
|------|-------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas (fixed in previous pass, PR #72) | No change |
| `aro_emission_protocol.md` | ✅ Canonical lifecycle with mermaid diagram (fixed in previous pass) | No change |
| `payment_distribution.md` | ✅ Canonical 75/25 split (fixed in previous pass) | No change |
| `AROS_Coin_TokenSpec.json` | ⚠️ **Wrong**: fee split was 75/20/5 (AST treasury / Audit Pool); `burnOn: "governance_rule"` | **Fixed** → 75/25 (nodePool/afcReserve); `burnOn: "transaction_completion"` |
| `burn_and_mint_rules.md` | ✅ Non-contradictory | No change |
| `README.md` | ✅ Architecture overview; no formula conflicts | No change |

**Module 01 is NOT deprecated** — it is pure documentation. The canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` interfaces correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented (source of truth) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for fiat-deposit path |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is a deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (`defaultCommissionRate: 0.005`) |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic DB transaction |
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
  │    totalReserve += afcShare
  │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically within a single `QueryRunner` transaction. On any failure the entire cycle rolls back.

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

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Changes Made in This Pass (2026-06-04)

### Fixed: `01_coin_engine/AROS_Coin_TokenSpec.json`

The machine-readable token spec had two discrepancies vs. the canonical model:

| Field | Before | After |
|-------|--------|-------|
| `transactionFees.distribution` | `{ nodeOperators: 0.75, "AST treasury": 0.20, "Audit Pool": 0.05 }` | `{ nodePool: 0.75, afcReserve: 0.25 }` |
| `supplyMechanism.burnOn` | `"governance_rule"` | `"transaction_completion"` |
| `transactionFees.calculation` | `"gasless_weighted + time_priority + load_balance"` | `"transactionAmount * commissionRate"` |
| `transactionFees.defaultCommissionRate` | *(missing)* | `0.005` |

The old 75/20/5 split (nodeOperators/AST treasury/Audit Pool) contradicted the canonical 75/25 model implemented in code and aligned documentation. `burnOn: "governance_rule"` was wrong — ARO are burned automatically on every transaction completion, not only on governance votes.

---

## 7. Prior Pass Changes (2026-05-12, PR #72 → merged)

| File | Change |
|------|--------|
| `01_coin_engine/coin_emission_model.md` | Replaced `E = F/N` with canonical 1:1 formulas, AFC reserve index, example |
| `01_coin_engine/aro_emission_protocol.md` | Replaced complex load-index formula with canonical 1:1 + 75/25 + burn flow |
| `01_coin_engine/payment_distribution.md` | Replaced 60/15/15/5/5 table with canonical 75/25 split and PoT weight formula |

---

## 8. Recommendations (Outstanding)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table with periodic persistence snapshots.
- **Wire `mintForTransaction()` into bridge/ingestion path** — replace all direct `mint()` calls in the fiat-deposit pipeline with the canonical entry point; `mint()` should be reserved for internal bridge use only.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard, 75+25=100 invariant.
- **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve to the ledger per epoch but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` is therefore not updated from epoch fees, only from per-TX emission calls.
