# AGENT_CORE_REPORT — Canonical Emission Model Audit

**Date:** 2026-05-27  
**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-ZXdVa`  
**Commit tag:** `feat: canonical 1:1 emission model implementation`

---

## 1. Scope Explored

| Path | Status |
|------|--------|
| `01_coin_engine/` | **Deprecated** (confirmed) — spec-only docs |
| `10_proof_of_transaction_engine/` | Active — PoT validation & incentive distribution |
| `src/token/` | **Active** — canonical implementation lives here |
| `08_fee_distribution/` | Active — epoch-level fee distribution docs |
| `smart_contracts/contracts/ArosCoinReserveManager.sol` | On-chain AFC reserve contract |

---

## 2. Status of Module 01 (Coin Engine)

`01_coin_engine/` is **formally deprecated** (per `README.md` at repo root).  
It contains specification documents only — no executable code.

The logical home of the emission engine was **migrated to `src/token/`**, specifically:

| File | Role |
|------|------|
| `src/token/emission.service.ts` | **Canonical implementation** — the single source of truth |
| `src/token/emission.interfaces.ts` | TypeScript types: `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `src/token/token.service.ts` | Entry point for calling code; houses `mintForTransaction()` |
| `src/token/tokenomics.service.ts` | Processing-pool budget formula + price proxy for legacy callers |
| `src/token/entities/supply_snapshot.entity.ts` | Append-only audit trail of every mint/burn cycle |

The `01_coin_engine/coin_emission_model.md` is kept as a human-readable reference and **cross-references `src/token/emission.service.ts`** explicitly.

---

## 3. Verification Against Canonical Model

### Canonical Model (spec)

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × rate    (default 0.5%)
Node Share   = Commission × 0.75            (75% → processing nodes, PoT-weighted)
AFC Reserve  = Commission × 0.25            (25% → locked AFC reserve)

ARO burns on transaction completion (transient tokens).
Net circulating supply change per TX cycle = 0.

Price Index  = 1.0 + sqrt(totalAfcReserve) / 10_000
              (sub-linear; rises monotonically as reserve accumulates)
```

### Code (`emission.service.ts`) — Line-by-line Match

| Canonical Rule | Code Location | Verdict |
|----------------|---------------|---------|
| `Emission = txAmount` (1:1) | `calculate()` line 58: `const emission = transactionAmount` | ✅ MATCH |
| `Commission = txAmount × rate` | line 59: `const commission = transactionAmount * rate` | ✅ MATCH |
| Default rate = 0.5% | line 29: `defaultCommissionRate: 0.005` | ✅ MATCH |
| `nodeShare = commission × 0.75` | line 60: `commission * this.config.nodeShareRatio` (= 0.75) | ✅ MATCH |
| `afcShare = commission × 0.25` | line 61: `commission * this.config.afcReserveRatio` (= 0.25) | ✅ MATCH |
| Mint ARO 1:1 to recipient | `processTransactionEmission()` Step 1, line 102 | ✅ MATCH |
| 75% → node pool | Step 2a, line 113 | ✅ MATCH |
| 25% → AFC reserve | Step 2b, line 124 | ✅ MATCH |
| Burn emitted ARO post-TX | Step 4, line 138 | ✅ MATCH |
| Net circulating = 0 | `updateSupplySnapshot()` line 226: `prevSupply.toFixed(8)` | ✅ MATCH |
| Price index formula | `updateAfcReserve()` line 175-176 | ✅ MATCH |
| Atomic DB transaction (queryRunner) | lines 96–161 | ✅ MATCH |
| Rollback on failure | `catch` block line 156 | ✅ MATCH |

**Overall verdict: `emission.service.ts` fully implements the canonical 1:1 model. No rewrite required.**

---

## 4. Issues Found & Fixed

### Issue 1 — Legacy `mint()` method lacked `@deprecated` annotation
**File:** `src/token/token.service.ts`  
**Problem:** The legacy `mint()` method (FIAT_DEPOSIT bridge path) had no `@deprecated` tag and
confusing inline comments. A reader could mistake it for the canonical emission path.  
**Fix:** Added a clear `@deprecated` JSDoc block pointing to `mintForTransaction()` and cleaned
up the log statement.

### Issue 2 — Legacy `burn()` lacked `@deprecated` annotation
**File:** `src/token/token.service.ts`  
**Problem:** The bridge-layer `burn()` (FIAT_WITHDRAWAL) had no deprecation notice, making it
ambiguous whether this was the canonical post-TX burn or a bridge operation.  
**Fix:** Added `@deprecated` JSDoc clarifying this is the bridge burn path, not the canonical
post-TX burn that runs automatically inside `EmissionService.processTransactionEmission()`.

### Issue 3 — `mockEmissionService` missing `getCurrentEmissionPrice`
**File:** `src/token/token.service.spec.ts`  
**Problem:** `mintForTransaction()` calls `this.emissionService.getCurrentEmissionPrice()` to
populate the emitted event payload, but the test mock didn't define this method. Any test
invoking `mintForTransaction()` would throw `TypeError: ... is not a function`.  
**Fix:** Added `getCurrentEmissionPrice: jest.fn().mockReturnValue(1.0)` and `getAfcReserveState`
to the mock. Expanded the `processTransactionEmission` mock return to include all `EmissionResult`
fields with correct 1:1 values.

### Issue 4 — No tests for canonical emission path
**File:** `src/token/token.service.spec.ts`  
**Problem:** The test suite only covered the legacy `mint()` and `burn()` methods. The canonical
`mintForTransaction()` entrypoint had zero test coverage.  
**Fix:** Added a dedicated `describe('mintForTransaction (canonical 1:1 emission)')` block with
three tests:
- Delegation to `EmissionService.processTransactionEmission()` with correct arguments
- Rejection of non-positive transaction amounts (0 and negative)
- Forwarding of custom `commissionRate` to `EmissionService`

---

## 5. Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/token/token.service.ts` | Modified | `@deprecated` annotations on `mint()` and `burn()` |
| `src/token/token.service.spec.ts` | Modified | Fixed mock, added canonical emission tests |
| `AGENT_CORE_REPORT.md` | Updated | This report |

---

## 6. Files Unchanged (Already Correct)

| File | Why Unchanged |
|------|---------------|
| `src/token/emission.service.ts` | Fully implements canonical model — no changes needed |
| `src/token/emission.interfaces.ts` | Correctly typed; matches spec exactly |
| `src/token/tokenomics.service.ts` | Processing-pool formula correct; price proxy noted |
| `src/token/entities/supply_snapshot.entity.ts` | Correctly stores audit trail |
| `01_coin_engine/*.md` | Deprecated spec docs — read-only reference, no code |

---

## 7. Canonical Transaction Flow (Verified)

```
TRANSACTION: $10,000 USD
   │
   ▼
TokenService.mintForTransaction(10000, recipient, refId)
   │
   ▼
EmissionService.processTransactionEmission()   ← atomic DB transaction
   │
   ├─ [Step 1]  MINT  10,000.00000000 ARO  →  recipient           (1:1)
   │
   ├─ [Step 2a] FEE_DISTRIBUTION  37.50000000 ARO  →  NODE_POOL   (75% of 50 ARO fee)
   │
   ├─ [Step 2b] FEE_DISTRIBUTION  12.50000000 ARO  →  AFC_RESERVE (25% of 50 ARO fee)
   │
   ├─ [Step 3]  AFC reserve total += 12.50
   │            reserveIndex = 1.0 + sqrt(totalReserve) / 10_000  (↑ price rises)
   │
   ├─ [Step 4]  BURN  10,000.00000000 ARO  ←  recipient           (transient)
   │
   └─ [Step 5]  SupplySnapshot saved:
                  totalMinted    += 10,000   (audit trail)
                  totalBurned    += 10,000   (audit trail)
                  circulatingSupply = UNCHANGED  (net zero per TX cycle)
```

---

## 8. Conclusion

The canonical 1:1 ArosCoin emission model is **correctly implemented** in
`src/token/emission.service.ts`. Module 01 (`01_coin_engine/`) is deprecated as documented, with
the executable logic properly residing in `src/token/`. The changes delivered in this audit
improve code clarity (deprecation annotations) and test coverage (canonical emission tests)
without altering any business logic.

The emission formula, fee split ratios, burn mechanism, AFC reserve price index, and supply
snapshot accounting all **exactly match** the canonical specification.
