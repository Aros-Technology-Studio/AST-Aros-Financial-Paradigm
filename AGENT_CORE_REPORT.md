# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-AzdLj`  
**Date:** 2026-05-15  
**Task:** Audit ArosCoin emission logic against the canonical model, fix any divergences, and confirm alignment

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no Deprecated flag)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, 75/25 split, burn rules — fully aligned |
| `aro_emission_protocol.md` | ✅ Describes canonical emit → distribute → burn cycle |
| `payment_distribution.md` | ✅ Canonical 75/25 split with PoT-weight validator distribution |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy |
| `README.md` | ✅ Architecture overview, no conflicts |

**Module 01 is NOT deprecated** — it is pure documentation. All canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT runtime code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct (pre-existing)

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct types |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `updateAfcReserve()` made public (this patch) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a no-op (deprecated); price source is `EmissionService` |
| `token.module.ts` | ✅ `EmissionService` registered and exported |
| `emission.service.spec.ts` | ✅ New unit tests added (this patch) |

### src/fee_distribution/ — Status: Gap fixed (this patch)

| File | State |
|------|-------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies 75/25 split; now also calls `emissionService.updateAfcReserve()` (this patch) |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical Spec | Code State |
|------|---------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger entry for `emissionAmount` in atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Epoch AFC → price index rises | Yes | ✅ **Fixed this patch** — `emissionService.updateAfcReserve()` now called on epoch finalization |

---

## 3. Gap Found and Fixed

### Gap: Epoch-level AFC contributions did not update the emission price index

**Before this patch:**  
`FeeDistributionService.distributeRewards()` correctly split epoch fees 75/25 and recorded the AFC reserve share on the ledger — but never called `EmissionService.updateAfcReserve()`. The in-memory `reserveIndex` (which controls emission pricing) was therefore only updated on individual per-transaction emissions, not on epoch-level fee accumulations.

**After this patch:**  
1. `EmissionService.updateAfcReserve()` visibility changed from `private` to `public` (with zero-guard added).  
2. `FeeDistributionService` injects `EmissionService` and calls `updateAfcReserve(afcReserve)` immediately after recording the epoch AFC ledger entry.  
3. Both code paths (per-TX and per-epoch) now keep the price index in sync.

---

## 4. Implementation Detail

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
  │    if afcAmount <= 0: return
  │    totalReserve += afcShare
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
```

All four ledger steps execute atomically within a single `QueryRunner` transaction.

### FeeDistributionService — Epoch path (`src/fee_distribution/fee_distribution.service.ts`)

```
distributeRewards(epoch, totalFees, weights)
  │
  ├─ nodePool   = totalFees × 0.75
  ├─ afcReserve = totalFees × 0.25
  │
  ├─ Ledger FEE_DISTRIBUTION: afcReserve → SYSTEM_AFC_RESERVE
  ├─ emissionService.updateAfcReserve(afcReserve)   ← NEW
  │    reserveIndex rises → next emission costs more
  └─ For each node: distribute nodePool × weight → VALIDATOR_REWARD
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

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on zero/negative)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing — guard `if (afcAmount <= 0) return` ensures this
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)
6. Both TX-level and epoch-level AFC contributions now update the price index

---

## 7. Files Changed in This Pass

| File | Change |
|------|--------|
| `src/token/emission.service.ts` | `updateAfcReserve()` changed from `private` to `public`; zero-guard added |
| `src/fee_distribution/fee_distribution.service.ts` | `EmissionService` injected; `updateAfcReserve()` called after epoch AFC ledger entry |
| `src/token/emission.service.spec.ts` | New — unit tests for `calculate()`, `updateAfcReserve()`, `updateCommissionRate()` |
| `AGENT_CORE_REPORT.md` | Updated with current findings |

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table and restore on boot.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace all legacy `mint()` calls in the bridge/ingestion path with the canonical entry point.
- **Epoch AFC sync on boot** — on startup, replay epoch AFC ledger entries to restore `reserveIndex` from DB before the in-memory structure is rebuilt.
