# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-rwqvew` → target `agent/core-emission`  
**Date:** 2026-06-10  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm or correct alignment

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation-only (Deprecated label in README/Module Map)

| File | Content status |
|------|---------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, AFC reserve index, $10 k example |
| `aro_emission_protocol.md` | ✅ Canonical lifecycle sequence diagram, Section VI allocation flow, Section VIII KILL_SWITCH |
| `payment_distribution.md` | ✅ 75/25 node/AFC split with PoT weight formula |
| `burn_and_mint_rules.md` | ✅ General burn-on-completion policy; no conflict |

**Finding:** Module 01 is labeled *(Deprecated)* in `README.md` and `docs/architecture/Module_Map.md` but contains no source code — it is a specification layer. The implementation of the canonical model lives exclusively in `src/token/emission.service.ts`. The two are consistent.

---

### 10_proof_of_transaction_engine — Status: Documentation-only

Spec `.md` files for PoT validation, incentive distribution, slashing, signature model.  
Actual PoT code: `src/proof_of_transaction_engine/`. No emission logic here.

---

### src/token/ — Status: Canonical implementation verified

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` interfaces correctly typed |
| `emission.service.ts` | ✅ Full canonical lifecycle; **+ KILL_SWITCH guard added** |
| `token.service.ts` | ✅ `mintForTransaction()` → `EmissionService`; legacy `mint()`/`burn()` preserved for FIAT bridge |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is no-op |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

---

### src/fee_distribution/ — Status: Canonical; gap closed

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` | ✅ 75/25 split applied at epoch level; **+ `EmissionService.updateAfcReserve()` called after epoch AFC recording** |

**Gap closed:** Previously the epoch-level 25 % AFC allocation was recorded on the ledger but the in-memory `AfcReserveState.reserveIndex` in `EmissionService` was not updated. This meant `getCurrentEmissionPrice()` only reflected per-TX commissions, not epoch fees. Now both code paths update the same price index.

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Commission = TX Amount × rate | default 0.5 % | ✅ `commission = transactionAmount * rate`, `defaultCommissionRate: 0.005` |
| Fee split: 75 % nodes | Yes | ✅ `nodeShare = commission * 0.75` → `SYSTEM_NODE_POOL` |
| Fee split: 25 % AFC reserve | Yes | ✅ `afcShare = commission * 0.25` → `SYSTEM_AFC_RESERVE` |
| ARO burn after TX | Yes | ✅ Step 4 records `BURN` for `emissionAmount` atomically |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| KILL_SWITCH halts emission | Yes (§VIII of canonical protocol) | ✅ Guard added to `processTransactionEmission()` |
| Epoch AFC syncs emission price | Yes | ✅ `emissionService.updateAfcReserve()` called on epoch close |

---

## 3. Implementation Detail

### EmissionService canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ KILL_SWITCH guard: throws if KILL_SWITCH=true
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare     → SYSTEM_NODE_POOL   (from recipient)
  ├─ Ledger FEE_DISTRIBUTION: afcShare      → SYSTEM_AFC_RESERVE (from recipient)
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All five ledger operations and the supply snapshot execute atomically within a single `QueryRunner` transaction (auto-rollback on any failure).

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
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out per SupplySnapshot)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` if `txAmount ≤ 0`
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero emission)
4. `reserveIndex` is monotonically non-decreasing (sqrt growth only adds, never subtracts)
5. All ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. `KILL_SWITCH=true` → `BadRequestException` before any ledger writes

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | Added KILL_SWITCH guard at the top of `processTransactionEmission()`; changed `updateAfcReserve` from `private` to public |
| `src/fee_distribution/fee_distribution.service.ts` | Injected `EmissionService`; called `emissionService.updateAfcReserve(afcReserve)` after epoch AFC ledger record to keep emission price index in sync |
| `AGENT_CORE_REPORT.md` | Refreshed for this session (2026-06-10) |

---

## 7. Open Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on process restart. Add a dedicated `afc_reserve_snapshots` table with periodic writes; restore on startup.
- **Wire `mintForTransaction()` into bridge/ingestion path** — replace any remaining `mint()` calls (FIAT bridge path) that bypass the canonical fee split, if those flows are intended to follow the same model.
- **Add `EmissionService` unit tests** — cover: dust amounts, max commission rate boundary (rate ≥ 1 guard), KILL_SWITCH rejection, AFC index monotonicity across multiple calls.
- **Epoch AFC → persistent AfcReserveState** — once persistence is added, `FeeDistributionService` should write the updated state to the DB after each epoch so the index survives restarts correctly.
