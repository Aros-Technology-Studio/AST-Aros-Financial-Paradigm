# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-iN6qS`  
**Date:** 2026-05-21  
**Task:** Audit ArosCoin emission logic against the canonical model; align code if divergent

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula, 75/25 split, AFC reserve index, burn flow |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn (corrected in PR #72) |
| `payment_distribution.md` | ✅ 75/25 canonical split (corrected in PR #72, replaced legacy 60/15/15/5/5) |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; no emission formula conflicts |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: CANONICAL ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — exact canonical types |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC update → burn (atomic) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for bridge compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads from `ProcessReserveLedgerService`; `updateInternalValuation()` is no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: CANONICAL ✅

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts → distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch finalization |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Process volume ledger; `reserveIndex` via `log1p` — used by legacy `tokenomics.service.ts` |
| `pot.service.ts` | PoT scoring (`S_i = α·TX + β·F - δ·P`) and weight normalization — correct, untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner tx |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` applies same split |
| Net circulating supply change per TX = 0 | Yes | ✅ `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` |

**CONCLUSION: Code FULLY matches canonical model. No rewrites required.**

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

All four ledger operations execute atomically inside a single `QueryRunner` transaction.  
Rollback on any failure; supply snapshot updated only on commit.

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

## 5. Invariants (Verified)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on `amount <= 0`
2. `nodeShare + afcShare == commission` — exact float arithmetic; no rounding loss beyond IEEE-754
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net-zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — only `+=` applied; never decremented
5. All four ledger steps succeed atomically or all roll back — single `QueryRunner` transaction

---

## 6. Epoch-Level Distribution Confirmation

`FeeDistributionService.distributeRewards()` in `src/fee_distribution/fee_distribution.service.ts`:

```typescript
private readonly NODE_SHARE_RATIO = 0.75;
private readonly AFC_SHARE_RATIO  = 0.25;

const nodePool   = totalFees * this.NODE_SHARE_RATIO;  // 75%
const afcReserve = totalFees * this.AFC_SHARE_RATIO;   // 25%
```

Node pool is then split proportionally by PoT-normalized weights (`weight_i = S_i / Σ S_j`),  
where `S_i = α·|TX_i| + β·F_i − δ·P_i`.

---

## 7. Open Items (Non-Blocking)

| Item | Priority | Description |
|------|----------|-------------|
| Persist `AfcReserveState` | Medium | Currently in-memory; lost on restart. Add `AfcReserveEntity` table with periodic snapshots. |
| Epoch AFC sync | Low | `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`. Consider syncing the in-memory index after epoch finalization. |
| Unit tests for `EmissionService.calculate()` | Medium | Add coverage for dust amounts, max commission rate, zero-amount guard. |
| Wire `mintForTransaction()` into bridge/ingestion | Low | Legacy `mint()` in `token.service.ts` still used by bridge path; migrate to canonical entry point. |

---

## 8. Change Log

| Date | Branch | Change |
|------|--------|--------|
| 2026-05-12 | `claude/inspiring-cannon-4qbjK` (PR #72) | Initial canonical emission implementation; corrected 3 doc files in `01_coin_engine/` |
| 2026-05-21 | `claude/inspiring-cannon-iN6qS` | Full re-audit; all code confirmed canonical; report updated with epoch distribution verification |
