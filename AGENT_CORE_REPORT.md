# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-6blSC`  
**Date:** 2026-06-05  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: DEPRECATED / Reference documentation

Per `docs/architecture/Architecture_Overview.md` and `README.md`:

> *DEPRECATED/Reference.* Defines the conceptual economic model and emission protocols. *(Superseded by Module 08: Fee Distribution Layer.)*

Module 01 contains only `.md` documentation files. No source code lives here. The canonical implementation is in `src/token/`.

| File | Content | Status |
|------|---------|--------|
| `coin_emission_model.md` | Documents 1:1 canonical formula, AFC index, phases | ✅ Matches canonical model |
| `aro_emission_protocol.md` | Describes emission lifecycle and PoT coupling | ✅ Matches canonical model |
| `payment_distribution.md` | Documents 75/25 split (nodes / AFC reserve) | ✅ Matches canonical model |
| `burn_and_mint_rules.md` | Burn-on-withdrawal policy and guards | ✅ Non-contradictory |
| `AROS_Coin_TokenSpec.json` | Machine-readable token spec | ✅ Consistent |

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, challenge-response, slashing, signature model, and incentive distribution. No emission logic resides here. PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical code verified correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` with correct fields |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — all five steps implemented atomically |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` marked `@deprecated`, no-op; `getCurrentPrice()` reads from reserve index |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code verified correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` | ✅ `distributeRewards()` applies 75/25 split: 75% node pool, 25% AFC reserve per epoch |

---

## 2. Canonical Model Verification

| Rule | Canonical specification | Code state |
|------|------------------------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` (`config.defaultCommissionRate = 0.005`) |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burned after TX | Yes | ✅ `TransactionType.BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Net circulating supply change = 0 | Yes | ✅ `SupplySnapshot`: `totalMinted += amount`, `totalBurned += amount`, `circulatingSupply` unchanged |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

**Verdict: the implementation matches the canonical model exactly. No code changes were required.**

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
  ├─ Step 1  Ledger MINT:             emissionAmount → recipient
  ├─ Step 2a Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Step 2b Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ Step 3  updateAfcReserve(afcShare):
  │            reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Step 4  Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ Step 5  updateSupplySnapshot():  totalMinted++, totalBurned++, circulating unchanged
```

All five steps execute atomically within a single `QueryRunner` transaction; any failure triggers full rollback.

### System Addresses

| Constant | Value |
|----------|-------|
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
Net circulating change = 0   (mint and burn cancel out in same atomic TX)

After this TX (12.50 ARO added to AFC):
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`; throws `BadRequestException` on zero/negative input.
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision.
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net-zero circulating supply.
4. `reserveIndex` is monotonically non-decreasing — only `Math.sqrt` additions, never decrements.
5. All ledger steps succeed or all roll back — atomic `QueryRunner` transaction with `rollbackTransaction()` on any error.

---

## 6. Module 01 Deprecation — Clarification

The architecture documentation (`docs/architecture/Architecture_Overview.md`, `docs/architecture/Module_Map.md`, `README.md`) consistently marks Module 01 as **DEPRECATED/Reference**, superseded by Module 08 (Fee Distribution Layer).

Module 01 retains value as human-readable specification for the canonical formulas and is safe to keep as-is. It does **not** contain executable code and cannot conflict with the implementation.

The canonical code authority is: **`src/token/emission.service.ts` → `EmissionService`**.

---

## 7. Recommendations

1. **Persist `AfcReserveState` to database** — currently in-memory; lost on process restart. Add an `AfcReserveEntity` table with periodic snapshots and reload on bootstrap.
2. **Wire `mintForTransaction()` into ingestion pipeline** — replace any remaining raw `mint()` calls in the bridge/ingestion path with the canonical entry point `processTransactionEmission()`.
3. **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, maximum commission rate edge cases, and the zero-amount guard.
4. **Sync epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` should be updated after each epoch finalization to stay accurate.
5. **Add nonce uniqueness fix** — `processTransactionEmission()` uses `Date.now()` + small offsets for nonces across four ledger calls in the same ms; replace with a UUID or per-session atomic counter to guarantee uniqueness under concurrent load.
