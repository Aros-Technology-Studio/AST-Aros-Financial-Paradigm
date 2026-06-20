# AGENT_CORE_REPORT — Canonical Emission Model Audit

**Branch:** `claude/inspiring-cannon-pbozrm`
**Date:** 2026-06-20
**Scope:** 01_coin_engine, 10_proof_of_transaction_engine, src/emission, src/commission, src/reserve, src/aroscoin

---

## 1. Where the emission logic lives

`01_coin_engine/` contains **historical Model-A documentation only** — no executable code. No deprecation marker is needed; this folder was never the NestJS implementation. The canonical logic is implemented in the NestJS module tree under `src/`:

| Responsibility | Module | Key file |
|---|---|---|
| Mint / burn process part | `src/emission` | `emission.service.ts` |
| Fee computation, epoch distribution | `src/commission` | `commission.service.ts` |
| Reserve index, AFC accrual tracking | `src/reserve` | `reserve.service.ts` |
| Ledger tallies (processMinted, processBurned, earnedRetained) | `src/aroscoin` | `aroscoin.service.ts` |
| PoT gate | `src/pot` | `pot.service.ts` |
| Full lifecycle orchestration | `src/orchestrator` | `orchestrator.service.ts` |

The path `src/token/emission.service.ts` referenced in `01_coin_engine/coin_emission_model.md` does **not exist** — that document predates the Model-1 module layout.

---

## 2. Canonical model vs implementation — line-by-line

### 2.1 Emission = Transaction Amount (1:1)

**Canonical:** `Emission = txAmount`
**Code (`emission.service.ts:55`):** `emit(processId, amount)` mints exactly `amount` and burns `amount`.
**Result:** CORRECT — 1:1, no multiplier.

### 2.2 PoT gate — no emission without verified=1

**Canonical:** `mint allowed only when PoT verified(process) == 1`
**Code (`emission.service.ts:57`):**
```typescript
if (!verdict || verdict.verified !== 1) {
    return { authorized: false, minted: 0, burned: 0, processId };
}
```
**Result:** CORRECT — neither mint nor burn executes for an unverified process.

### 2.3 Burn on TX completion

**Canonical:** `ARO burned after TX completes; net circulating change = 0`
**Code (`emission.service.ts:62`):** `burn()` is called immediately after `mint()` within `emit()`. `processNet = processMinted - processBurned` converges to 0 (invariant I5).
**Result:** CORRECT.

### 2.4 Commission rate = 0.5%, split 75% nodes / 25% AFC Reserve

**Canonical:** `Commission = txAmount × 0.005; nodeShare = commission × 0.75; AFC = commission × 0.25`
**Code (`commission.service.ts:69,72`):**
```typescript
readonly feeRate = 0.005;     // 0.5%
readonly marginRate = 0.25;   // 25% → AFC Reserve; 75% → nodes
```
**Result:** CORRECT. Example: `computeFee(10000)` → 50 ARO commission; nodes get 37.5 ARO, AFC gets 12.5 ARO.

> Note: `reference/ast-core/src/commission.ts` uses `feeRate = 0.01` and `marginRate = 0.2` — the reference core differs from the canonical spec. The NestJS service follows the canonical spec.

### 2.5 AFC Reserve grows → price of next emission higher

**Canonical:** As AFC Reserve accumulates, the emission price index rises.
**Code (before this fix):** `reserveIndex()` used only `totalProcessVolume`; `totalAfcReserve()` existed and was populated by Commission on epoch finalization, but that value had **no effect** on the price formula. AFC accruals were recorded for audit purposes only.
**Result:** GAP FOUND — AFC accruals did not feed the capitalization index.

---

## 3. Fix applied

### `src/reserve/reserve.service.ts` — `reserveIndex()` formula

**Before:**
```typescript
async reserveIndex(): Promise<number> {
    const volume = await this.totalProcessVolume();
    return log10(1 + volume);
}
```

**After:**
```typescript
async reserveIndex(): Promise<number> {
    const [volume, afc] = await Promise.all([this.totalProcessVolume(), this.totalAfcReserve()]);
    return log10(1 + volume + afc);
}
```

The extended formula `log10(1 + totalProcessVolume + totalAfcReserve)` preserves:
- The spec's logarithmic soft-growth characteristic (I-RS-2, I-RS-4)
- Monotonic non-decreasing behaviour: both inputs only accumulate on the append-only NodeChain
- Pure derivation from NodeChain history — no stored authority
- Zero index on an empty economy: `log10(1 + 0 + 0) = 0`

`getCurrentEmissionPrice()` was added as a named alias for callers that express the price concept explicitly.

### `src/emission/emission.service.ts` — `calculate()` pure function

Added a side-effect-free breakdown function:

```typescript
calculate(txAmount: number, rate = 0.005): { emission, commission, nodeShare, afcReserve }
```

For `txAmount = 10,000` at default rate 0.5%:
```
emission   = 10,000     (1:1, minted then burned — net 0)
commission =     50     (0.5%)
nodeShare  =  37.50     (75% of commission → nodes by PoT weight at epoch finalization)
afcReserve =  12.50     (25% of commission → AFC Reserve → raises emission price index)
nodeShare + afcReserve == commission  (reconciles exactly)
```

---

## 4. Tests added / updated

| File | Change |
|---|---|
| `src/reserve/reserve.service.spec.ts` | Added `'AFC accrual raises the emission price index'` test; updated I-RS-2 derivation check to sum both `emission.minted` and `reserve.afc.accrual` events from NodeChain |
| `src/emission/emission.service.spec.ts` | Added two `calculate()` tests: default rate (10,000 ARO tx) and custom rate |

---

## 5. Invariants status after fix

| ID | Rule | Status |
|---|---|---|
| I1 | Value exists only when PoT verified=1 | PASS |
| I2 | Every emission bound to a confirmed process | PASS |
| I3 | Significant events recorded in NodeChain | PASS |
| I4 | Deterministic: same input → same result | PASS |
| I5 | Process part nets to 0 (minted == burned) | PASS |
| I6 | totalSupply derivable from history | PASS |
| I7 | Commission pool reconciles per epoch | PASS |
| I8 | NodeChain append-only, hash-continuous | PASS |
| I9 | Node influence from work+reputation, no stake | PASS |
| I10 | All-Seeing Eye passive — no state change | PASS |

---

## 6. Summary

The canonical 1:1 emission model was substantially correct in `src/`. One gap was identified and closed: **the AFC Reserve was accrued into NodeChain but did not feed the emission price index**. After the fix:

1. Every verified process → `emission.minted` event → volume feeds `reserveIndex`.
2. Every epoch finalization → Commission routes 25% AFC share → `reserve.afc.accrual` event → AFC feeds `reserveIndex`.
3. `reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)` rises monotonically as the economy grows and epochs settle.
4. Higher `reserveIndex` → higher `internalPrice` → the next emission cycle carries a higher internal valuation.

The complete canonical cycle: TX verified → 10,000 ARO minted → 10,000 ARO burned (net 0) → 50 ARO commission accrued → epoch finalized → 37.5 ARO to nodes, 12.5 ARO to AFC Reserve → emission price index rises.
