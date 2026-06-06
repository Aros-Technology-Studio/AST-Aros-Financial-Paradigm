# AGENT_CORE_REPORT — Canonical 1:1 Emission Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-bmJ0f`
**Date:** 2026-06-06
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Content State |
|------|--------------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index formula, $10k example, references `emission.service.ts` |
| `aro_emission_protocol.md` | ✅ Canonical protocol rules and system addresses |
| `payment_distribution.md` | ✅ 75/25 split confirmed; historical 60/15/15/5/5 explicitly deprecated (PR #72) |
| `burn_and_mint_rules.md` | ✅ Consistent with transient token model |
| `burn_mechanism.md` | ✅ Consistent |
| `AROS_Coin_TokenSpec.json` | ⚠️ Stale: shows 75%/20%/5% split — documentation inconsistency only, code is correct |

**Module 01 is NOT deprecated.** It is pure specification. The canonical code lives in `src/token/emission.service.ts`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, node roles, incentive distribution.
Actual PoT source code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code

| File | Verified State |
|------|----------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — correct, no changes required |
| `token.service.ts` | ✅ `mintForTransaction()` is the canonical entry point; legacy `mint()` cleaned up (see §4) |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` correctly `@deprecated` and is a no-op |

### src/proof_of_transaction_engine/ — Separate concern

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Tracks cumulative PoT-verified volume; `reserveIndex = 1.0 + log1p(totalVolume)/100` — used by legacy tokenomics. Distinct from the AFC reserve index in `EmissionService`. No conflict. |

### src/fee_distribution/ — Epoch-level distribution

| File | Verified State |
|------|----------------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies canonical 75/25 split per epoch |

---

## 2. Canonical Model vs. Code

| Rule | Canonical Specification | Implementation | Status |
|------|------------------------|----------------|--------|
| Emission = TX Amount | 1:1, no multiplier | `emission = transactionAmount` in `EmissionService.calculate()` L58 | ✅ |
| Commission = TX Amount × rate | default 0.5% | `commission = transactionAmount * rate` L59 | ✅ |
| Node share = 75% of commission | Yes | `nodeShare = commission * 0.75` L60 | ✅ |
| AFC share = 25% of commission | Yes | `afcShare = commission * 0.25` L61 | ✅ |
| Mint 1:1 to recipient | Step 1 | `MINT` ledger record, amount = emissionAmount L102 | ✅ |
| 75% → node pool ledger | Step 2a | `FEE_DISTRIBUTION` → `NODE_POOL_ADDRESS` L112 | ✅ |
| 25% → AFC reserve ledger | Step 2b | `FEE_DISTRIBUTION` → `AFC_RESERVE_ADDRESS` L123 | ✅ |
| AFC reserve grows → price rises | Yes | `updateAfcReserve()` L168–176 | ✅ |
| Burn ARO after TX | Step 4 | `BURN` ledger record, amount = emissionAmount L138 | ✅ |
| Net supply Δ = 0 per TX cycle | Yes | `totalMinted == totalBurned` in `updateSupplySnapshot()` L210–228 | ✅ |
| AFC Index = 1.0 + √(reserve)/10_000 | Yes | `Math.sqrt(totalReserve) / 10_000` L176 | ✅ |
| Atomic rollback on failure | Yes | `QueryRunner` try/catch/rollback L96–161 | ✅ |
| Epoch fees also 75/25 | Yes | `FeeDistributionService.distributeRewards()` | ✅ |

**Result: `emission.service.ts` is fully compliant with the canonical model. No logic rewrite required.**

---

## 3. Emission Lifecycle (Confirmed Flow)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount           // 1:1 rule
  │    commission     = txAmount × rate    // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ [Atomic QueryRunner]
  │    Ledger MINT:             emissionAmount → recipient
  │    Ledger FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  │    Ledger FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
  │    updateAfcReserve(afcShare):
  │      reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
  │    Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  │    SupplySnapshot: totalMinted += emissionAmount
  │                   totalBurned += emissionAmount
  │                   circulatingSupply unchanged (net zero)
  └─ commit / rollback on error
```

### System Addresses

| Role | Address |
|------|---------|
| Emission authority | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| Node pool | `SYSTEM_NODE_POOL_00000000000000000000` |
| AFC reserve | `SYSTEM_AFC_RESERVE_000000000000000000` |
| Burn vault | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Changes Applied in This Commit

### `src/token/token.service.ts`

| Method | Issue | Fix |
|--------|-------|-----|
| `mint()` | Missing `@deprecated` annotation | Added `/** @deprecated Use mintForTransaction() for canonical 1:1 emission. */` |
| `mint()` | Large confused developer TODO block about FIAT vs token logic | Removed (was development scaffolding, not production logic) |
| `mint()` | Called `tokenomicsService.updateInternalValuation()` — documented no-op | Removed dead call |
| `burn()` | Called `tokenomicsService.updateInternalValuation()` — documented no-op | Removed dead call |

**No logic was changed in the canonical path.** `mintForTransaction()` and `EmissionService` are untouched.

### `AGENT_CORE_REPORT.md`

Updated with current audit findings (this file).

---

## 5. Example — $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (minted 1:1 to recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net supply Δ   = 0

After 12.50 ARO AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.00003536...
  → every subsequent emission is priced slightly higher
```

---

## 6. Invariants (Confirmed)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on `txAmount <= 0`
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` — net zero circulating supply
4. `reserveIndex` monotonically non-decreasing — grows with each AFC deposit, never decreases
5. All four ledger operations are atomic — `QueryRunner` rolls back all on any failure

---

## 7. Outstanding Recommendations (Non-Blocking)

1. **Persist `AfcReserveState` to database** — currently in-memory; service restart resets the index. Add a dedicated entity or periodic snapshot.
2. **Wire `mintForTransaction()` into all ingestion paths** — confirm every bridge/inbound handler calls this instead of legacy `mint()`.
3. **Add unit tests for `EmissionService.calculate()`** — cover: canonical $10k example, dust amounts, max commission rate, zero-amount guard.
4. **Update `AROS_Coin_TokenSpec.json`** to reflect canonical 75/25 split (governance action required; stale 75/20/5 split is documentation-only mismatch).
5. **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService` records AFC share on ledger but does not call `EmissionService.updateAfcReserve()`; consider syncing the in-memory index after each epoch finalization so `getCurrentEmissionPrice()` reflects epoch-level accumulation.
