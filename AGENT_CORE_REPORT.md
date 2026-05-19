# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-8VWYm` (deliverable: `agent/core-emission`)  
**Date:** 2026-05-19  
**Task:** Audit ArosCoin emission logic against the canonical model; align code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, worked example |
| `aro_emission_protocol.md` | ✅ Canonical formulas, Mermaid sequence diagram, supply invariants |
| `payment_distribution.md` | ✅ 75/25 split documented; validator weight formula present |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy; no contradictions |
| `README.md` | ✅ Architecture overview; no formula conflicts |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source of truth lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, and incentive distribution.
Actual PoT implementation lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed and extended

| File | State | Notes |
|------|-------|-------|
| `emission.interfaces.ts` | ✅ Correct | `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Correct | Full canonical 1:1 lifecycle (calculate → mint → fee split → AFC update → burn) |
| `token.service.ts` | ✅ Correct | `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ Correct | `getCurrentPrice()` → `processReserve.reserveIndex`; `updateInternalValuation()` deprecated no-op |
| `token.controller.ts` | **✅ Fixed** | Added `POST /api/v1/token/emit` — canonical entry point now HTTP-accessible |
| `token.module.ts` | ✅ Correct | `EmissionService` registered as provider and exported |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code |
|------|-----------|------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction; rollback on any failure |

---

## 3. Fix Applied — Canonical HTTP Endpoint

**Problem:** `POST /api/v1/token/mint` called the legacy `TokenService.mint()` which performs a standalone
MINT with no fee split and no burn. The canonical `mintForTransaction()` existed in the service layer
but was not reachable over HTTP.

**Fix:** Added `POST /api/v1/token/emit` to `TokenController`:

```typescript
@Post('emit')
async emitForTransaction(
    @Body() body: { transactionAmount: number; recipient: string; referenceId: string; commissionRate?: number },
) {
    const result = await this.tokenService.mintForTransaction(...);
    return { status: 'SUCCESS', ...result, emissionPrice: this.emissionService.getCurrentEmissionPrice() };
}
```

The legacy `POST /token/mint` is retained for backward compatibility with AFC bridge calls
that predate the canonical model; it is not part of the PoT emission lifecycle.

---

## 4. Canonical Lifecycle (EmissionService)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1, no multiplier
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
Net circulating change = 0

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353…
  → every subsequent emission is priced higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`; throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only ever increases)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction)

---

## 7. Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; state is lost on restart. Add an `AfcReserveEntity` table with periodic snapshots or recover from ledger on startup.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate boundary, zero-amount guard.
- **Sync epoch AFC into `EmissionService`** — `FeeDistributionService` records AFC reserve to the ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory price index drifts after epoch finalization.
- **Deprecate `POST /token/mint`** — schedule removal once all bridge callers migrate to `POST /token/emit`.
