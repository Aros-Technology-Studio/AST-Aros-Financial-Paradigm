# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-r3d4k`
**Date:** 2026-05-17
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code; NOT deprecated)

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example — aligned |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 + 75/25 + burn lifecycle — aligned |
| `payment_distribution.md` | ✅ 75/25 split documented correctly |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation + reference impl

Spec files for PoT validation, slashing, signature model, and incentive distribution.
Actual PoT engine lives in `src/proof_of_transaction_engine/`. No emission logic in this module.

### src/token/ — Canonical emission: VERIFIED CORRECT

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct shapes |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — see §3 |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` retained for fiat bridge |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` delegates to `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is a documented no-op |
| `token.module.ts` | ✅ `EmissionService` registered and exported as provider |

### src/fee_distribution/ — Epoch-level distribution: VERIFIED CORRECT

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies canonical 75/25 split to epoch-collected fees |

Constants in `fee_distribution.service.ts`:
```typescript
private readonly NODE_SHARE_RATIO = 0.75;
private readonly AFC_SHARE_RATIO  = 0.25;
```

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | PoT scoring, weight normalization, role assignment — correct |
| `process_reserve.service.ts` | Volume ledger + `reserveIndex` via `log1p` — used by legacy tokenomics path |

---

## 2. Canonical Model Compliance Matrix

| Rule | Canonical spec | Code state |
|------|---------------|------------|
| `Emission = txAmount` | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| `Commission = txAmount × rate` | default 0.5% | ✅ `commission = transactionAmount * rate`, default `0.005` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burned after TX completes | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic `QueryRunner` |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch-level fee split 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| Net circulating supply change = 0 per TX cycle | Yes | ✅ `SupplySnapshot`: `totalMinted += emissionAmount`, `totalBurned += emissionAmount`, `circulatingSupply` unchanged |

**Result: All seven canonical rules are correctly implemented in `src/token/emission.service.ts` and `src/fee_distribution/fee_distribution.service.ts`. No corrective changes required.**

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount             // 1:1
  │    commission     = txAmount × rate      // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:              emissionAmount  → recipient           (1:1 emit)
  ├─ Ledger FEE_DISTRIBUTION:  nodeShare       → SYSTEM_NODE_POOL   (75%)
  ├─ Ledger FEE_DISTRIBUTION:  afcShare        → SYSTEM_AFC_RESERVE (25%)
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:              emissionAmount  → SYSTEM_BURN_VAULT  (ARO transient)
```

All four ledger steps execute **atomically** in a single `QueryRunner` transaction. Failure of any step rolls back all steps.

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

### Governance hook

`EmissionService.updateCommissionRate(newRate)` allows governance to adjust the commission rate within `(0, 1)` exclusive. Validated with `BadRequestException` on out-of-bounds input.

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
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on `amount <= 0`
2. `nodeShare + afcShare == commission` — exact float split, no intentional rounding loss
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing — only grows as AFC accumulates
5. All four ledger steps succeed or all roll back — enforced by `QueryRunner` atomicity

---

## 6. Scope Note: Bridge / Legacy Paths

`src/bridge/bridge.service.ts` and `src/token/token.controller.ts` call the **legacy** `TokenService.mint()`. This is by design:

- **Legacy `mint()`** — models a fiat-to-ARO conversion (FIAT_DEPOSIT). Tokens are issued to the user's wallet and remain in circulation as a persistent balance. This is the correct path for the banking bridge.
- **Canonical `mintForTransaction()`** — models a payment transaction. Tokens are emitted (1:1), fees are distributed, tokens are burned. Net supply change = 0. This is the correct path for in-system payment settlement.

Both paths are intentional and serve distinct roles. No change is warranted.

---

## 7. Recommendations (carry-forward from prior audit)

| Priority | Recommendation | Status |
|----------|---------------|--------|
| HIGH | **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add `AfcReserveEntity` table with periodic snapshots. | Open |
| MEDIUM | **Sync epoch AFC contribution into `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; in-memory index can diverge from ledger state after epoch finalization. | Open |
| MEDIUM | **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard. | Open |
| LOW | **Deprecate `POST /api/v1/token/mint` controller endpoint** — direct manual minting bypasses canonical flow and should require governance authorization. | Open |
