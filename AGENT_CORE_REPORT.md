# AGENT_CORE_REPORT — Canonical Emission Audit

**Branch:** `agent/core-emission`
**Date:** 2026-06-11
**Scope:** 01_coin_engine, 10_proof_of_transaction_engine, src/token/

---

## 1. Repository Structure

The repository uses a numbered module layout (01–14) where most numbered folders contain
only documentation. All executable source code lives under `src/`.

Key folders relevant to emission:

| Path | Type | Notes |
|------|------|-------|
| `01_coin_engine/` | Docs only | **DEPRECATED** — superseded by Module 08 + `src/token/` |
| `10_proof_of_transaction_engine/` | Docs only | PoT engine specification |
| `src/token/` | **Canonical source** | 12 TypeScript files; primary emission engine |
| `src/fee_distribution/` | Source | Epoch-level 75/25 fee split |
| `src/proof_of_transaction_engine/` | Source | PoT scoring + ProcessReserve |
| `smart_contracts/contracts/` | Solidity | `ArosCoinReserveManager.sol` (on-chain mint/burn) |

### Module 01 — Deprecated

Confirmed by `docs/architecture/Module_Map.md`:
> Module 01 — *(Deprecated)*. Defines the foundational economic concepts and specs.

The functional emission logic was migrated to:
- `src/token/emission.service.ts` — canonical lifecycle engine
- `src/fee_distribution/fee_distribution.service.ts` — epoch-level fee distribution
- `src/proof_of_transaction_engine/` — PoT scoring

---

## 2. Canonical Model (Specification)

```
Emission   = Transaction Amount             (1:1, no multiplier)
Commission = Transaction Amount × rate      (default 0.5%)
Node Share = Commission × 0.75             (75% → PoT-weighted nodes)
AFC Share  = Commission × 0.25             (25% → SYSTEM_AFC_RESERVE)

ARO minted to recipient on TX start.
ARO burned from recipient on TX completion.
Net circulating supply change per TX cycle = 0.

AFC Reserve Index = 1.0 + sqrt(totalAfcReserve) / 10_000
  → rises monotonically; every new emission costs more.
```

---

## 3. Findings

### 3.1 `src/token/emission.service.ts` — ✅ CANONICAL (no changes needed)

`EmissionService.processTransactionEmission()` correctly implements the full lifecycle:

1. **Mint** — `SYSTEM_EMISSION_AUTHORITY` mints `emissionAmount` ARO 1:1 to recipient.
2. **Fee split 75%** — `FEE_DISTRIBUTION` tx records `nodeShare` to `SYSTEM_NODE_POOL`.
3. **Fee split 25%** — `FEE_DISTRIBUTION` tx records `afcReserveShare` to `SYSTEM_AFC_RESERVE`.
4. **AFC index update** — `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000`.
5. **Burn** — `BURN` tx destroys `emissionAmount` from recipient to `SYSTEM_BURN_VAULT`.
6. **Supply snapshot** — `totalMinted` and `totalBurned` both increase by `emissionAmount`;
   `circulatingSupply` net change = 0.

All steps wrapped in a `QueryRunner` atomic transaction with rollback on failure.

`EmissionService.calculate()` is a pure function returning `EmissionResult`:

```typescript
const rate       = commissionRate ?? 0.005;
const emission   = transactionAmount;          // 1:1
const commission = transactionAmount * rate;
const nodeShare  = commission * 0.75;
const afcShare   = commission * 0.25;
```

### 3.2 `src/token/token.service.ts` — ⚠️ PARTIAL VIOLATION (fixed)

`TokenService.mintForTransaction()` — ✅ Correct canonical entry point. Delegates fully to
`EmissionService.processTransactionEmission()` and emits a `token.emission.canonical` event.

`TokenService.mint()` — ⚠️ **Legacy method; does NOT follow canonical model:**
- Mints ARO without burning → increases `circulatingSupply` permanently.
- No fee split (no 75/25 distribution).
- Calls deprecated `updateInternalValuation()` (no-op).
- Used for `FIAT_DEPOSIT` backward-compatibility only.

**Fix applied:** Added `@deprecated` JSDoc directing callers to `mintForTransaction()`.

### 3.3 `src/token/token.controller.ts` — ⚠️ VIOLATION (fixed)

`POST /api/v1/token/mint` called `TokenService.mint()` (legacy) instead of the canonical
`mintForTransaction()`. Any external caller hitting this endpoint received non-canonical
behavior: no burn, no fee split, incorrect supply accounting.

**Fix applied:** Endpoint now calls `mintForTransaction()` with updated request body schema:

```
Before: { amount: string;  recipient: string; refId: string }
After:  { transactionAmount: number; recipient: string; referenceId: string; commissionRate?: number }
```

### 3.4 `src/token/tokenomics.service.ts` — ⚠️ WRONG PRICE FORMULA (fixed)

`TokenomicsService.getCurrentPrice()` sourced from `ProcessReserveLedgerService.reserveIndex`
which uses a **logarithmic formula**:

```typescript
// OLD (wrong source)
reserveIndex = 1.0 + (Math.log1p(totalProcessVolume) / 100)
```

The canonical AFC price formula is **square-root based**:

```typescript
// CANONICAL (EmissionService)
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

These produce different values. Any price quote from `TokenomicsService.getCurrentPrice()`
was diverging from the canonical model.

**Fix applied:** `TokenomicsService` now injects `EmissionService` (no circular dependency —
`EmissionService` has no dependency on `TokenomicsService`) and delegates:

```typescript
getCurrentPrice(): number {
    return this.emissionService.getCurrentEmissionPrice();
}
```

### 3.5 `src/fee_distribution/fee_distribution.service.ts` — ✅ CORRECT

`FeeDistributionService.distributeRewards()` correctly applies the canonical 75/25 split at
epoch finalization:

```typescript
private readonly NODE_SHARE_RATIO = 0.75;
private readonly AFC_SHARE_RATIO  = 0.25;

const nodePool   = totalFees * 0.75;
const afcReserve = totalFees * 0.25;
```

AFC reserve contribution is recorded as a `FEE_DISTRIBUTION` transaction to
`SYSTEM_AFC_RESERVE_000000000000000000`. No changes needed.

### 3.6 `src/proof_of_transaction_engine/process_reserve.service.ts` — ℹ️ LEGACY INDEX (kept)

`ProcessReserveLedgerService` maintains a **PoT process volume index** (cumulative validated
transaction volume), separate from the AFC reserve. Its log-based index formula is intentional
for its domain (PoT backing value). This service is **not** the canonical price source;
`EmissionService` is. No changes applied to this service.

---

## 4. Changes Applied

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | `POST /api/v1/token/mint` now calls canonical `mintForTransaction()` |
| `src/token/token.service.ts` | `mint()` marked `@deprecated` with redirect to `mintForTransaction()` |
| `src/token/tokenomics.service.ts` | `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` (canonical AFC sqrt formula) |

---

## 5. Canonical Flow (Post-Fix)

```
POST /api/v1/token/emit
  └─► TokenController.emitForTransaction()
        └─► TokenService.mintForTransaction(txAmount, recipient, refId)
              └─► EmissionService.processTransactionEmission()
                    ├─ 1. MINT       txAmount ARO → recipient           (1:1)
                    ├─ 2a. FEE_DIST  txAmount×0.5%×0.75 → NODE_POOL    (75%)
                    ├─ 2b. FEE_DIST  txAmount×0.5%×0.25 → AFC_RESERVE  (25%)
                    ├─ 3. INDEX      reserveIndex = 1.0 + √(afcTotal) / 10_000
                    ├─ 4. BURN       txAmount ARO → BURN_VAULT
                    └─ 5. SNAPSHOT   totalMinted++, totalBurned++, circulatingSupply unchanged
```

---

## 6. Verified Example ($10,000 transaction)

```
TX Amount    = 10,000
Emission     = 10,000 ARO  minted to recipient
Commission   = 10,000 × 0.005 = 50 ARO
  Node pool  = 50 × 0.75  = 37.50 ARO → SYSTEM_NODE_POOL
  AFC share  = 50 × 0.25  = 12.50 ARO → SYSTEM_AFC_RESERVE
Burn         = 10,000 ARO  destroyed
Net supply Δ = 0
```

---

## 7. System Addresses

| Address | Role |
|---------|------|
| `SYSTEM_EMISSION_AUTHORITY_00000000000` | Mints ARO (emission source) |
| `SYSTEM_NODE_POOL_00000000000000000000` | Receives 75% of commission |
| `SYSTEM_AFC_RESERVE_000000000000000000` | Receives 25% — drives price index |
| `SYSTEM_BURN_VAULT_00000000000000000000` | Terminal burn address |

---

## 8. Deprecated Items Confirmed

| Location | Status | Replacement |
|----------|--------|-------------|
| `01_coin_engine/` folder | Deprecated — docs only | `src/token/emission.service.ts` + Module 08 |
| `TokenomicsService.updateInternalValuation()` | `@deprecated` no-op | `EmissionService.processTransactionEmission()` |
| `TokenService.mint()` | `@deprecated` (marked this audit) | `TokenService.mintForTransaction()` |

---

## 9. Additional Fixes (2026-06-11 audit pass on `agent/core-emission`)

Two residual defects were found and resolved in the same branch:

### 9.1 `01_coin_engine/AROS_Coin_TokenSpec.json` — Fee Distribution Outdated ❌ → ✅ Fixed

The machine-readable spec described an archaic 3-way split (nodeOperators 0.75 / AST treasury 0.20 / Audit Pool 0.05) that predated the canonical 2-way model. Updated to the canonical split, and added `commissionRate` and `distributionNote` fields for machine-readability.

### 9.2 `src/token/token.controller.ts` — Canonical Endpoint & Price Route ❌ → ✅ Fixed

- Added `POST /api/v1/token/emit` as the primary canonical emission entrypoint.
- Added `GET /api/v1/token/emission/price` returning current `reserveIndex` and `AfcReserveState`.
- `EmissionService` injected directly into the controller for price reads.
- Legacy `POST /api/v1/token/mint` now routes to `mintForTransaction()` and carries `@deprecated` notice.
