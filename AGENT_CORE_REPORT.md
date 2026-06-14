# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-dujqij`  
**Date:** 2026-06-14  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or rewrite as needed

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow + Mermaid sequence diagram |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; no conflicts |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** Pure specification documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

| File | Purpose |
|------|---------|
| `pot_engine_overview.md` | PoT protocol high-level |
| `pot_tx_weighting_model.md` | Node scoring formula: `S_i = α·|TX_i| + β·F_i − δ·P_i` |
| `pot_node_role_assignment.md` | Validator/Attestator/Observer tier thresholds |
| `pot_slashing_conditions.md` | Penalty rules |
| `pot_tx_incentive_distribution.md` | Per-epoch reward distribution |
| `pot_tx_signature_model.md` | Signature and validation protocol |
| `pot_tx_validation_logic.md` | Validation state machine |
| `pot_challenge_response.md` | Byzantine fault challenge protocol |

Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in Module 10.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split (75/25) → AFC index update → burn (atomic) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compatibility |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is legacy no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | PoT scoring (`calculateNodeScore`) and normalized weight (`calculateNormalizedWeights`) — correct |
| `process_reserve.service.ts` | Reserve volume ledger; `reserveIndex` via `log1p` — consumed by legacy `TokenomicsService` |

### src/fee_distribution/ — Status: Canonical code confirmed correct

`fee_distribution.service.ts → distributeRewards()` implements 75% node pool / 25% AFC reserve per epoch finalization, consistent with canonical model.

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` (`EmissionService.calculate()`) |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completes | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted == totalBurned` per TX cycle |
| All ledger steps are atomic | Yes | ✅ Single `QueryRunner` with `startTransaction` / `commitTransaction` / `rollbackTransaction` |

**Result: Code FULLY MATCHES canonical model. No rewrites required.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1 (no multiplier)
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75 // 75% → nodes
  │    afcShare       = commission × 0.25 // 25% → AFC reserve
  │
  ├─ [ATOMIC QueryRunner transaction]
  │    Ledger MINT:             emissionAmount  → recipient
  │    Ledger FEE_DISTRIBUTION: nodeShare       → SYSTEM_NODE_POOL
  │    Ledger FEE_DISTRIBUTION: afcShare        → SYSTEM_AFC_RESERVE
  │    updateAfcReserve(afcShare):
  │       reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  │    Ledger BURN:             emissionAmount  → SYSTEM_BURN_VAULT
  │    SupplySnapshot: totalMinted+= emissionAmount, totalBurned+= emissionAmount
  └─ [commit or rollback]
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### PoT Service (`src/proof_of_transaction_engine/pot.service.ts`)

Node scoring formula (canonical):
```
S_i = α·|TX_i| + β·F_i − δ·P_i
weight_i = S_i / Σ S_j
```
Roles assigned by weight percentile: top 30% → Validators, next 50% → Attestators, rest → Observers.

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight at epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.00003536
  → subsequent emissions are priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on `transactionAmount <= 0`
2. `nodeShare + afcShare == commission` — exact floating-point split, no discarded remainder
3. `totalMinted == totalBurned` per canonical TX cycle — enforced in `updateSupplySnapshot()` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing — grows as `sqrt(totalReserve)`, never decreases
5. All four ledger operations succeed or all roll back — single `QueryRunner` transaction

---

## 6. Open Issues (non-blocking)

| # | Issue | Priority |
|---|-------|----------|
| 1 | `AfcReserveState` is in-memory — lost on restart. Add persistent `AfcReserveEntity` table with periodic snapshots. | Medium |
| 2 | `IngestionService.ingestAsset()` has commented-out `TokenService.mint()` call — should call `mintForTransaction()` for canonical flow once uncommented. | Medium |
| 3 | No unit tests for `EmissionService.calculate()` — cover dust amounts, max commission rate, zero-amount guard. | Low |
| 4 | `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()` — in-memory `reserveIndex` not updated at epoch finalization. | Low |

---

## 7. History

| Pass | Branch | Key change |
|------|--------|-----------|
| 2026-05-12 | `claude/inspiring-cannon-4qbjK` | Aligned `01_coin_engine/` docs: replaced `E = F/N` with canonical 1:1 formulas; replaced 60/15/15/5/5 split with canonical 75/25 |
| 2026-06-14 | `claude/inspiring-cannon-7sksc6` | Code audit confirmed: `emission.service.ts` fully implements canonical model; no code rewrites needed |
| 2026-06-14 | `claude/inspiring-cannon-dujqij` | Re-audit confirms: all docs, interfaces, and service code match canonical model. No changes to emission logic. |
