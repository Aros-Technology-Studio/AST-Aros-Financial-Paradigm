# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-hdyTO`  
**Date:** 2026-06-05  
**Task:** Audit ArosCoin emission logic against the canonical model; rewrite any non-conforming code

---

## 1. Canonical Model (reference)

| Rule | Value |
|------|-------|
| Emission amount | `= Transaction Amount` (1:1, no multiplier) |
| Commission | `= Transaction Amount × rate` (default 0.5%) |
| Fee split — nodes | 75% of commission → `SYSTEM_NODE_POOL` |
| Fee split — AFC reserve | 25% of commission → `SYSTEM_AFC_RESERVE` |
| ARO lifecycle | Minted at TX start, burned at TX end (transient) |
| AFC reserve growth | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Price effect | Each emission priced higher as reserve accumulates |

---

## 2. Directory Audit

### `01_coin_engine/` — Documentation only

No source code. Contains `.md` specs describing the emission model, burn/mint rules, and payment distribution.  
**Status: Not deprecated.** Documentation references `src/token/emission.service.ts` as the canonical implementation.

### `10_proof_of_transaction_engine/` — Documentation only

Contains `.md` specs for PoT consensus (validation, slashing, incentive distribution, signature model).  
No emission logic here.  
Actual PoT code lives in `src/proof_of_transaction_engine/`.

### `src/token/` — Source of truth for emission

| File | Pre-patch state | Action |
|------|----------------|--------|
| `emission.service.ts` | ✅ Fully canonical | No change |
| `emission.interfaces.ts` | ✅ Correct type definitions | No change |
| `token.service.ts` → `mintForTransaction()` | ✅ Canonical entry point | No change |
| `token.service.ts` → `mint()` | ❌ Legacy: MINT only, no fee split, no burn | **Rewritten** |
| `token.service.ts` → `burn()` | ✅ Correct withdrawal path | Removed deprecated no-op call |
| `tokenomics.service.ts` → `updateInternalValuation()` | Deprecated no-op, still called from `burn()` | Call removed from `burn()` |
| `token.controller.ts` | ❌ No canonical endpoint exposed | **Added `POST /emit`** |
| `token.service.spec.ts` | Tests verified old non-canonical `mint()` | **Updated** |

---

## 3. Conformance Verification

| Rule | `emission.service.ts` | `token.service.ts#mint()` before patch |
|------|-----------------------|----------------------------------------|
| Emission = TX Amount (1:1) | ✅ `emission = transactionAmount` | ❌ Minted without 1:1 declaration |
| Fee = TX × rate | ✅ `commission = txAmount * rate` | ❌ No fee calculated |
| 75% → node pool | ✅ Ledger `FEE_DISTRIBUTION` | ❌ Not recorded |
| 25% → AFC reserve | ✅ Ledger `FEE_DISTRIBUTION` | ❌ Not recorded |
| ARO burn after TX | ✅ Ledger `BURN` in same atomic TX | ❌ No burn — circulating supply grew permanently |
| AFC index updated | ✅ `updateAfcReserve(afcShare)` | ❌ Not updated |
| Atomic (all-or-nothing) | ✅ `QueryRunner` with rollback | ⚠️ Had its own `QueryRunner` but incomplete |

---

## 4. Changes Made

### `src/token/token.service.ts` — `mint()` rewritten

**Before:** Direct `LedgerService.recordTransaction(MINT)` with no fee distribution and no burn. Circulating supply grew on every call.

**After:** Delegates to `mintForTransaction()` which calls `EmissionService.processTransactionEmission()`. The canonical lifecycle (Mint → FeeDistrib → Burn) is now enforced for every ARO emission regardless of entry point. Smart contract on-chain reference is preserved.

```
mint(amount, recipient, refId)
  └─ mintForTransaction(txAmount, recipient, refId)
       └─ EmissionService.processTransactionEmission(...)
            ├─ MINT   emissionAmount → recipient
            ├─ FEE_DISTRIBUTION  nodeShare (75%) → SYSTEM_NODE_POOL
            ├─ FEE_DISTRIBUTION  afcShare  (25%) → SYSTEM_AFC_RESERVE
            ├─ updateAfcReserve(afcShare)
            └─ BURN   emissionAmount → SYSTEM_BURN_VAULT
  └─ SmartContractIntegration.recordReference(refId, 'MINT', ...)
```

### `src/token/token.service.ts` — `burn()` cleanup

Removed the call to `tokenomicsService.updateInternalValuation()` (marked `@deprecated`, was a no-op).

### `src/token/token.controller.ts` — canonical endpoint added

New endpoint: `POST /api/v1/token/emit`  
Accepts `{ amount, recipient, referenceId, commissionRate? }`, returns full `EmissionResult`.  
The existing `POST /api/v1/token/mint` now routes through the canonical flow via the rewritten `mint()`.

### `src/token/token.service.spec.ts` — tests updated

- `mockEmissionService` enriched with `getCurrentEmissionPrice` mock.
- `mint` test suite rewritten: verifies `processTransactionEmission` is called (canonical), smart contract reference is recorded, and canonical fields are present in the response.
- Added negative-path tests: zero-amount guard and emission error propagation.

---

## 5. Emission Lifecycle — Canonical Flow

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount              // 1:1
  │    commission     = txAmount × rate       // 0.5% default
  │    nodeShare      = commission × 0.75     // 75% to nodes
  │    afcShare       = commission × 0.25     // 25% to AFC reserve
  │
  ├─ Ledger MINT            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION nodeShare     → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION afcShare      → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN            emissionAmount → SYSTEM_BURN_VAULT
  
  All four ledger steps execute atomically (QueryRunner). Rollback on any failure.
```

---

## 6. Example: $10,000 Transaction

```
TX Amount       = 10,000 ARO
Emission        = 10,000 ARO  (1:1 mint → recipient)
Commission      = 10,000 × 0.005 = 50 ARO
  Node pool     = 50 × 0.75  = 37.50 ARO
  AFC reserve   = 50 × 0.25  = 12.50 ARO
Burn            = 10,000 ARO  (destroyed after TX)
Net circulating = 0           (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000354
  → every subsequent emission is priced higher
```

---

## 7. Invariants (all enforced in `EmissionService`)

1. `emissionAmount == transactionAmount` — throws `BadRequestException` on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle — `SupplySnapshot.circulatingSupply` stays flat
4. `reserveIndex` is monotonically non-decreasing — only `+=` applied to `totalReserve`
5. All four ledger steps succeed or all roll back — single atomic `QueryRunner` transaction

---

## 8. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 9. Open Recommendations (not blocking canonical conformance)

| Priority | Recommendation |
|----------|---------------|
| High | Persist `AfcReserveState` to a database table — currently in-memory; state lost on restart |
| High | Sync epoch AFC contributions into `EmissionService.updateAfcReserve()` — `FeeDistributionService` records AFC to ledger but doesn't update the in-memory price index |
| Medium | Add unit tests for `EmissionService.calculate()` — cover dust amounts, max rate boundary, zero-amount guard |
| Low | Remove `tokenomicsService` dependency from `TokenService` entirely — only the deprecated `getCurrentPrice()` call in `burn()` response message remains |
