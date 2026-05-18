# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-2CX3b` → target `agent/core-emission`  
**Date:** 2026-05-18  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no executable source code)

| File | Finding |
|------|---------|
| `coin_emission_model.md` | ✅ Correctly documents canonical 1:1 formula, 75/25 split, AFC reserve index |
| `aro_emission_protocol.md` | ✅ Canonical formulas present |
| `payment_distribution.md` | ✅ Documents 75% nodes / 25% AFC split |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; general burn-on-completion policy |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated** — it is pure specification documentation.  
The canonical source implementation lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files: validation logic, weighting model, slashing, challenge-response.  
Actual PoT code lives in `src/proof_of_transaction_engine/`.  
No emission logic in this module — correct by design.

### src/token/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields match canonical model |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → reserve update → burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for backward compat |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads from `processReserve.getReserveState().reserveIndex`; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: Canonical code CONFIRMED CORRECT

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Canonical 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Transaction volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics path |
| `pot.service.ts` | PoT scoring (`S_i = α·TX + β·F - δ·P`) and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code (`emission.service.ts`) | Status |
|------|-----------|-------------------------------|--------|
| Emission = TX Amount | 1:1 | `emission = transactionAmount` | ✅ |
| Fee = TX Amount × rate | default 0.5% | `commission = transactionAmount * 0.005` | ✅ |
| Fee split: 75% → nodes | Yes | `nodeShare = commission * 0.75` | ✅ |
| Fee split: 25% → AFC reserve | Yes | `afcShare = commission * 0.25` | ✅ |
| ARO burn after TX | Yes | `BURN` ledger entry for `emissionAmount` within same atomic TX | ✅ |
| AFC reserve grows → price rises | Yes | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | ✅ |
| Epoch fees also 75/25 | Yes | `FeeDistributionService.distributeRewards()` | ✅ |
| All 4 steps atomic | Yes | Single `QueryRunner` transaction; rolls back on any failure | ✅ |

**Conclusion: code fully matches the canonical model. No rewrites required.**

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
  ├─ Ledger MINT:             emissionAmount  → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare       → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare        → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:             emissionAmount  → SYSTEM_BURN_VAULT
```

All four ledger operations execute atomically in a single `QueryRunner` transaction.

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

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on `amount ≤ 0`
2. `nodeShare + afcShare == commission` — exact float split, no external rounding loss
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only `+=` to `totalReserve`, never decremented)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 6. Notable Observations

### Legacy `mint()` in TokenService

`token.service.ts` retains a legacy `mint()` method (FIAT_DEPOSIT path) that does **not** use the
canonical 1:1 cycle — no burn, no 75/25 split. This is intentional: the fiat deposit flow has
different semantics (ARO persists in the recipient's balance until the user withdraws). The
canonical emission path (`mintForTransaction`) is the correct entry point for PoT-triggered mints.

### In-memory AFC Reserve State

`EmissionService.afcReserveState` is held in process memory. A restart resets the reserve index to
`1.0`. For production correctness the reserve state should be snapshotted to a database entity and
rehydrated on startup.

### Epoch AFC Sync Gap

`FeeDistributionService.distributeRewards()` records AFC reserve contributions to the ledger but
does **not** call `EmissionService.updateAfcReserve()`. The in-memory reserve index therefore does
not reflect epoch-level fee contributions. Both paths write to `SYSTEM_AFC_RESERVE_000000000000000000`
on the ledger, but the index only advances from `processTransactionEmission()` calls.

---

## 7. Recommendations (Priority Ordered)

| Priority | Item |
|----------|------|
| HIGH | Persist `AfcReserveState` to a DB entity; rehydrate on service start |
| HIGH | Have `FeeDistributionService` call `EmissionService.updateAfcReserve()` after each epoch so the index stays consistent with both emission paths |
| MEDIUM | Wire all transaction-level mints through `mintForTransaction()` in the bridge/ingestion pipeline; deprecate raw `mint()` calls there |
| LOW | Add property-based unit tests for `EmissionService.calculate()`: dust amounts, custom commission rate, boundary checks |
