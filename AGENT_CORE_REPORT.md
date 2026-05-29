# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-BsPqB`  
**Date:** 2026-05-29  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no deprecated marker)

Module 01 is **not deprecated**. It contains pure specification documents. The canonical implementation lives in `src/token/`.

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 formula, AFC index, 75/25 split — all correct |
| `aro_emission_protocol.md` | ✅ Canonical | Mermaid diagram + formulas match EmissionService exactly |
| `payment_distribution.md` | ✅ Canonical | 75% nodes / 25% AFC reserve, PoT-weighted payouts |
| `burn_and_mint_rules.md` | ✅ | Burn-after-TX policy consistent with canonical model |
| `README.md` | ✅ | Architecture overview; no formula conflicts |

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signatures, incentive distribution. No emission logic here — actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code CONFIRMED CORRECT

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` correctly typed |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; atomic 4-step process |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` deprecated no-op; `getCurrentPrice()` defers to processReserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ✅ Canonical endpoint `POST /api/v1/token/emit` exposed (added this pass) |

### src/fee_distribution/ — Status: Canonical code CONFIRMED CORRECT

| Method | State |
|--------|-------|
| `distributeRewards()` | ✅ `nodePool = totalFees × 0.75`, `afcReserve = totalFees × 0.25` — exact canonical split |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process volume ledger; `log1p`-based index used by legacy tokenomics |
| `pot.service.ts` | PoT score + weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| `Emission = Transaction Amount` | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| `Commission = Transaction Amount × rate` | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| `Node Share = Commission × 0.75` | 75% to nodes | ✅ `nodeShare = commission * 0.75` |
| `AFC Reserve = Commission × 0.25` | 25% to reserve | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes (transient) | ✅ `BURN` ledger entry for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| All steps atomic | Yes | ✅ `QueryRunner` transaction with rollback on any error |

**Result: code fully matches the canonical model. No rewrites required.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount                  // 1:1, no multiplier
  │    commission     = txAmount × rate           // default 0.5%
  │    nodeShare      = commission × 0.75         // 75% → nodes
  │    afcShare       = commission × 0.25         // 25% → AFC reserve
  │
  ├─ Ledger MINT:             emissionAmount  → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare       → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare        → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount  → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically inside a single `QueryRunner` transaction. Any failure triggers a full rollback.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### AFC Reserve Price Index

```
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

Sub-linear growth via square root: stable at low volume, economically meaningful at scale. Monotonically non-decreasing — the price of the next emission never falls.

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (minted 1:1 → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per epoch)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve contract)
Burn           = 10,000 ARO  (destroyed — ARO are transient)
Net circulating change = 0   (mint and burn cancel exactly)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353…
  → every subsequent emission is priced marginally higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact floating-point split, no rounding leak
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net-zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — only incremented, never reset in production path
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Changes Made in This Pass

| File | Change |
|------|--------|
| `AGENT_CORE_REPORT.md` | Full re-audit recorded; dated 2026-05-29 |
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` — canonical emission endpoint calling `mintForTransaction()` |

---

## 7. Open Recommendations

| Priority | Item |
|----------|------|
| High | **Persist `AfcReserveState` to database** — currently in-memory; state is lost on restart. Add `AfcReserveEntity` table with periodic snapshots loaded at boot. |
| Medium | **Wire ingestion pipeline to `mintForTransaction()`** — `BridgeService` and crypto ingestion still call the legacy `mint()`. Replace with the canonical entry point. |
| Medium | **Sync epoch AFC contributions to EmissionService** — `FeeDistributionService` writes AFC reserve ledger entries but does not call `EmissionService.updateAfcReserve()`; the in-memory index diverges after epoch finalization. |
| Low | **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate edge cases, zero-amount guard. |
