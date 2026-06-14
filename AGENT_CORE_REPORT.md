# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-liwx3y`  
**Date:** 2026-06-14  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn flow |
| `payment_distribution.md` | ✅ Canonical 75/25 split; validator weight formula |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; left as-is |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Fixed this pass

| File | State |
|------|-------|
| `pot_tx_incentive_distribution.md` | ⚠️ → ✅ Old 60/30/10 split replaced with canonical 75/25 |
| All other `.md` files | ✅ Spec-only, no formula conflicts |

Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in module 10 source.

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC update → burn (atomic) |
| `emission.service.spec.ts` | ✅ **NEW** — 18 unit tests covering calculate(), reserve state, processTransactionEmission() |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` (`EmissionService.calculate()`) |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted == totalBurned` per cycle |

**Result: Code FULLY MATCHES canonical model. No rewrites were required.**

---

## 3. Changes Made This Pass

### 3.1 `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md`

**Problem:** Section 3 specified a 60% validators / 30% attesters / 10% burn split. This contradicts the canonical 75/25 model and the `EmissionService` implementation.

**Fix:** Rewrote sections 2–5 to use the canonical split:
- 75% commission → node pool (distributed by PoT weight)
- 25% commission → AFC reserve
- Burn is separate: emitted ARO burned post-TX (not from commission)

### 3.2 `src/token/emission.service.spec.ts` — NEW FILE

Created 18 unit tests covering:
- `calculate()`: 1:1 ratio, default rate, nodeShare, afcShare, split completeness, custom rate, dust amounts, guard on zero/negative amounts
- `getAfcReserveState()`: initial state, immutability of returned copy
- `getCurrentEmissionPrice()`: initial value
- `updateCommissionRate()`: valid rate applied, rejection of 0 and ≥1
- `processTransactionEmission()`: ledger call order (MINT→FEE→FEE→BURN), amounts, recipient addresses, AFC index growth, rollback on failure

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
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 7. Open Issues (carry-forward)

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | `AfcReserveState` is in-memory — lost on restart. Add `AfcReserveEntity` table with periodic snapshots. | Medium | Open |
| 2 | `IngestionService.ingestAsset()` calls `TokenService.mint()` (commented out) — should call `mintForTransaction()` for canonical flow. | Medium | Open |
| 3 | No unit tests for `EmissionService.calculate()` | Low | **Closed** — 18 tests added in `emission.service.spec.ts` |
| 4 | `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()` — in-memory index not updated after epoch finalization. | Low | Open |

---

## 8. History

| Date | Branch | Change |
|------|--------|--------|
| 2026-06-14 | `claude/inspiring-cannon-liwx3y` | Fixed `pot_tx_incentive_distribution.md` (60/30/10 → 75/25); added `emission.service.spec.ts` (18 tests) |
| 2026-06-14 | `claude/inspiring-cannon-7sksc6` | Full audit — code confirmed canonical; docs aligned in prior pass |
| 2026-05-12 | `claude/inspiring-cannon-4qbjK` | Aligned docs: `coin_emission_model.md`, `aro_emission_protocol.md`, `payment_distribution.md` |
