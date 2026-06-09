# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-drg26q`  
**Date:** 2026-06-09  
**Task:** Audit ArosCoin emission logic against the canonical model; fix any divergence

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | Canonical 1:1 formulas, AFC reserve index — correct |
| `aro_emission_protocol.md` | 4-step atomic flow (Mint → Fee split → AFC update → Burn) — correct |
| `payment_distribution.md` | 75% nodes / 25% AFC reserve — correct |
| `burn_and_mint_rules.md` | General burn-on-withdrawal policy — correct |

**Module 01 is NOT deprecated.** It is the canonical specification.  
Source-of-truth code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Specification files for PoT validation, slashing, signature model.  
Actual engine code lives in `src/proof_of_transaction_engine/`.  
No emission logic resides here.

**Discrepancy noted (non-blocking):** `pot_tx_incentive_distribution.md` shows a 60/30/10 split (validators/attesters/burn). This is an older epoch-level PoT allocation design and does not override the canonical per-transaction 75/25 split implemented in code. Code takes precedence.

### src/token/ — Status: Canonical engine correct; API layer fixed

| File | State |
|------|-------|
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — correct, no changes needed |
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — correct |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` — correct; `mint()` **newly marked `@deprecated`** |
| `token.controller.ts` | ⚠️ **FIXED** — `POST /mint` now routes to canonical `mintForTransaction()` |
| `tokenomics.service.ts` | `updateInternalValuation()` is a pre-existing deprecated no-op (kept for compat) |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ BURN ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Net circulating supply Δ = 0 | Yes | ✅ `SupplySnapshot`: totalMinted++, totalBurned++, circulatingSupply unchanged |

---

## 3. Root Cause of Non-Conformance (Fixed)

### Before fix — `src/token/token.controller.ts`

```
POST /api/v1/token/mint
  → tokenService.mint()   ← LEGACY PATH (non-canonical)
```

**`mint()` defects:**
1. No commission calculation — 0% fee to nodes or AFC reserve
2. No post-transaction burn — ARO stayed in circulation permanently
3. `circulatingSupply` incremented persistently instead of remaining net-zero
4. Calls deprecated `tokenomicsService.updateInternalValuation()` (no-op) instead of AFC reserve update

### After fix — `src/token/token.controller.ts`

```
POST /api/v1/token/mint
  → tokenService.mintForTransaction()   ← CANONICAL PATH
      → emissionService.processTransactionEmission()
```

---

## 4. Changes Made

### `src/token/token.controller.ts`

```diff
- return await this.tokenService.mint(body.amount, body.recipient, body.refId);
+ return await this.tokenService.mintForTransaction(
+     parseFloat(body.amount),
+     body.recipient,
+     body.refId,
+     body.commissionRate,   // optional — governance-controlled override
+ );
```

Also added optional `commissionRate` field to the request body type.

### `src/token/token.service.ts`

Added `@deprecated` JSDoc to `mint()`:

```typescript
/**
 * @deprecated Use mintForTransaction() for canonical 1:1 emission with commission split and burn.
 * This legacy path does not apply commission distribution or post-transaction burn,
 * and incorrectly tracks circulatingSupply as persistent rather than transient.
 */
```

---

## 5. Canonical Emission Flow (Post-Fix)

```
POST /api/v1/token/mint
  { amount, recipient, refId, commissionRate? }
        │
        ▼
TokenController.mintTokens()
        │  parseFloat(amount)
        ▼
TokenService.mintForTransaction()
        │
        ▼
EmissionService.processTransactionEmission()
        │
        ├─ [DB TRANSACTION START]
        ├─ MINT  emissionAmount → recipient           (1:1)
        ├─ FEE   commission×0.75 → SYSTEM_NODE_POOL   (75%)
        ├─ FEE   commission×0.25 → SYSTEM_AFC_RESERVE (25%)
        ├─ updateAfcReserve() → reserveIndex rises
        ├─ BURN  emissionAmount → SYSTEM_BURN_VAULT
        ├─ SupplySnapshot saved
        └─ [DB TRANSACTION COMMIT — rollback on any error]
        │
        ▼
EventEmitter: 'token.emission.canonical'
```

---

## 6. Example: $10,000 Transaction

```
TX Amount        = 10,000 ARO
Emission         = 10,000 ARO   (1:1 mint → recipient)
Commission       = 10,000 × 0.005 = 50 ARO
  Node pool      = 50 × 0.75  = 37.50 ARO
  AFC reserve    = 50 × 0.25  = 12.50 ARO
Burn             = 10,000 ARO   (destroyed post-TX)
Net supply Δ     =      0 ARO   (mint == burn)

After 12.50 ARO AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 ≈ 1.0000354
  → next emission costs slightly more
```

---

## 7. Invariants Confirmed

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero)
4. `reserveIndex` is monotonically non-decreasing — only grows, never shrinks
5. All four ledger steps succeed or all roll back (atomic QueryRunner transaction)

---

## 8. Recommendations (Carry-Forward)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on service restart. Add an `AfcReserveEntity` table.
- **Remove or redirect legacy `mint()`** — the method is deprecated; remove it once all bridge/ingestion callers are migrated to `mintForTransaction()`.
- **Unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Sync epoch AFC contributions into `EmissionService`** — `FeeDistributionService` records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index should be updated after each epoch finalization.

---

## 9. Previous Audit (2026-05-12)

The May 2026 pass corrected documentation divergences in `01_coin_engine/` and confirmed `EmissionService` was canonical. The remaining gap (API controller routing to legacy `mint()`) was not addressed at that time. This pass closes it.
