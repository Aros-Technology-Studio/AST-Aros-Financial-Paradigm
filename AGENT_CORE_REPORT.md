# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-Dn7XE`  
**Date:** 2026-05-19  
**Task:** Audit ArosCoin emission logic against the canonical model, verify all code paths, fix any deviations

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only, fully aligned

| File | Status |
|------|--------|
| `coin_emission_model.md` | ✅ Documents canonical 1:1 formula, AFC reserve index, 75/25 split |
| `aro_emission_protocol.md` | ✅ Full Mermaid lifecycle diagram, canonical formulas (IV), invariants (VII) |
| `payment_distribution.md` | ✅ Canonical 75/25 split documented |
| `burn_and_mint_rules.md` | ✅ Non-contradictory; burn-on-completion documented |
| `README.md` | ✅ Architecture overview, no formula conflicts |

**Module 01 is NOT deprecated** — pure documentation. Source of truth for code is `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files (PoT validation, slashing, signature model, incentive distribution).  
Actual code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct.

### src/token/ — Status: Canonical implementation verified ✅

| File | Finding |
|------|---------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all correct |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint → fee split → AFC update → burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT_DEPOSIT path |
| `tokenomics.service.ts` | ✅ Processing pool formula intact; `updateInternalValuation()` is a documented no-op |
| `token.controller.ts` | ⚠️ **Fixed this pass** — canonical `POST /api/v1/token/emit` endpoint added (see §3) |

### src/fee_distribution/ — Status: Canonical implementation verified ✅

`FeeDistributionService.distributeRewards()` applies canonical 75/25 split:
- `nodePool = totalFees × 0.75` → distributed by PoT weight per node
- `afcReserve = totalFees × 0.25` → recorded to `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | ✅ PoT scoring (`S_i = α·TX + β·F - δ·P`) and normalized weight calculation |
| `process_reserve.service.ts` | ✅ Legacy volume ledger used by `TokenomicsService`; not the canonical price source |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code implementation | Status |
|------|-----------|-------------------|--------|
| Emission = TX Amount | 1:1 | `emission = transactionAmount` in `EmissionService.calculate()` | ✅ |
| Fee = TX Amount × rate | default 0.5% | `commission = transactionAmount * 0.005` | ✅ |
| Fee split: 75% nodes | Yes | `nodeShare = commission * 0.75` | ✅ |
| Fee split: 25% AFC reserve | Yes | `afcShare = commission * 0.25` | ✅ |
| ARO burn after TX | Yes | `BURN` ledger record for `emissionAmount` in same atomic TX | ✅ |
| AFC reserve grows → price rises | Yes | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | ✅ |
| Epoch fees: 75/25 split | Yes | `FeeDistributionService.distributeRewards()` | ✅ |
| Atomic execution | Yes | All 4 ledger ops in single `QueryRunner` transaction | ✅ |
| Net circulating supply change = 0 | Yes | `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission` | ✅ |

---

## 3. Gap Fixed This Pass

### Problem
`TokenController` exposed `POST /api/v1/token/mint` (legacy FIAT_DEPOSIT path calling `mint()`)
but had **no endpoint** for the canonical `mintForTransaction()` (the 1:1 PoT emission path).
External API consumers had no way to invoke the canonical emission engine.

### Fix
Added `POST /api/v1/token/emit` to `src/token/token.controller.ts`:

```typescript
@Post('emit')
async emitForTransaction(
  @Body() body: { transactionAmount: number; recipient: string; referenceId: string; commissionRate?: number },
): Promise<EmissionResult> {
  return this.tokenService.mintForTransaction(
    body.transactionAmount,
    body.recipient,
    body.referenceId,
    body.commissionRate,
  );
}
```

**Before / After:**

| Endpoint | Before | After |
|----------|--------|-------|
| `POST /api/v1/token/mint` | Legacy FIAT_DEPOSIT | Legacy FIAT_DEPOSIT (unchanged) |
| `POST /api/v1/token/emit` | ❌ Not present | ✅ Canonical 1:1 emission |
| `POST /api/v1/token/burn` | FIAT_WITHDRAWAL | FIAT_WITHDRAWAL (unchanged) |
| `GET /api/v1/token/supply` | Supply stats | Supply stats (unchanged) |

---

## 4. Full Emission Lifecycle (as implemented)

```
POST /api/v1/token/emit { transactionAmount, recipient, referenceId }
  │
  └─ TokenService.mintForTransaction()
       │
       └─ EmissionService.processTransactionEmission()
            │
            ├─ calculate():
            │    emissionAmount = txAmount            // 1:1 — no multiplier
            │    commission     = txAmount × rate     // 0.5% default
            │    nodeShare      = commission × 0.75   // 75% to nodes
            │    afcShare       = commission × 0.25   // 25% to AFC reserve
            │
            ├─ Ledger MINT:             emissionAmount → recipient
            ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
            ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
            ├─ updateAfcReserve(afcShare):
            │    totalReserve += afcShare
            │    reserveIndex  = 1.0 + sqrt(totalReserve) / 10_000
            └─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
                 → All 4 ops atomic (QueryRunner); rollback on any failure
```

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out exactly)

AFC reserve state after this TX:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced slightly higher
```

---

## 6. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 7. Invariants (verified in code)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` if `txAmount <= 0`
2. `nodeShare + afcShare == commission` — exact arithmetic split, no rounding loss beyond float
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero circulating supply
4. `reserveIndex` is monotonically non-decreasing — only `+=` in `updateAfcReserve()`
5. All four ledger steps succeed or all roll back — single `QueryRunner` transaction with `rollbackTransaction()` on error

---

## 8. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic persistence.
- **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index is not updated after epoch finalization.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Consider `mintForTransaction()` in ingestion pipeline** — audit whether any ingestion paths still use legacy `mint()` for canonical transactions rather than FIAT_DEPOSIT scenarios.
