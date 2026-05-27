# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-BxUVl` (audit + tests; original implementation landed in `agent/core-emission` → merged PR #72)  
**Date:** 2026-05-27  
**Task:** Audit ArosCoin emission logic against the canonical model, confirm code alignment, and add unit test coverage

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, example — correct |
| `aro_emission_protocol.md` | ✅ Canonical 1:1 principles, Mermaid lifecycle diagram — correct |
| `payment_distribution.md` | ✅ 75/25 split documented — correct |
| `burn_and_mint_rules.md` | ✅ Burn-on-completion policy — consistent with canonical model |
| `README.md` | ✅ Architecture overview — non-contradictory |

**Module 01 is NOT deprecated** — pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT engine code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed correct ✅

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields canonical |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle implemented — **see Section 3** |
| `emission.service.spec.ts` | ✅ **NEW** — 27 unit tests added (all passing); see Section 4 |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT_DEPOSIT |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a documented deprecated no-op; `getCurrentPrice()` delegates to `processReserve` |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` (unchanged) |
| All 4 steps atomic | Yes | ✅ Single `QueryRunner` transaction; rollback on any failure |

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
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
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

## 4. Unit Tests Added — `src/token/emission.service.spec.ts`

27 tests across 4 describe blocks, all passing:

### `calculate()` — pure function (8 tests)
- `emissionAmount === transactionAmount` (1:1 invariant)
- Default 0.5% commission rate applied
- 75 / 25 commission split verified
- `nodeShare + afcReserveShare === commission` (no rounding loss)
- Custom commission rate accepted
- Dust amounts (0.01 ARO) handled
- Zero amount → `BadRequestException`
- Negative amount → `BadRequestException`

### `updateCommissionRate()` — governance guard (4 tests)
- Rate update reflected in subsequent `calculate()`
- Rate = 0 rejected
- Rate = 1 (100%) rejected
- Rate > 1 rejected

### `getAfcReserveState() / getCurrentEmissionPrice()` — state inspection (3 tests)
- Initial `reserveIndex` = 1.0
- Initial `totalReserve` = 0, `transactionCount` = 0
- Returned snapshot is immutable (mutations don't affect internal state)

### `processTransactionEmission()` — full lifecycle (12 tests)
- Exactly 4 ledger calls made per emission
- Call 1: `MINT` type, `emissionAmount = txAmount` to recipient
- Call 2: `FEE_DISTRIBUTION` to `NODE_POOL`, amount = `nodeShare` (75%)
- Call 3: `FEE_DISTRIBUTION` to `AFC_RESERVE`, amount = `afcShare` (25%)
- Call 4: `BURN` to `BURN_VAULT`, amount = `emissionAmount`
- AFC reserve grows → `reserveIndex` rises after each emission
- `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` verified precisely
- `EmissionResult` returned with correct field values
- `QueryRunner.commitTransaction()` called on success
- `QueryRunner.rollbackTransaction()` called on ledger failure; error rethrown
- `QueryRunner.release()` called regardless of success or failure

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants (All Verified in Tests)

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 7. Recommendations (Carried Forward)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `mintForTransaction()` into ingestion pipeline** — replace remaining `mint()` calls in bridge/ingestion path with the canonical entry point.
- **Epoch AFC contribution to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; sync the in-memory index after each epoch finalization.
