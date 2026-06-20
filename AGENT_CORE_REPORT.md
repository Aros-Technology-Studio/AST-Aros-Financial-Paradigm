# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-q8mqt4`
**Date:** 2026-06-20
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; not executable |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/token/` | Does not exist | N/A |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Docstring corrected (this run)** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Canonical formula source |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Definitive on formula |

`src/token/` does not exist — there is no legacy `token/` module. The production
emission logic lives entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`,
and `src/reserve/`.

Module `01_coin_engine/` is documentation only, not deprecated code. No executable
content resides there.

---

## 2. Canonical Model (verified against spec and reference)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; net = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              ← spec formula, confirmed volume only
  internalPrice  = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals   → NodeChain (audit trail only, not in formula)
```

Sources of authority (highest first): `docs/specs/AST_Reserve_AGENT_EN.md`,
`reference/ast-core/src/reserve.ts`. Both agree on the formula.

---

## 3. Conformant — No Logic Changes Needed

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch | ✓ Correct (I7) |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — volume only | ✓ Correct |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |

---

## 4. Deviation Found and Corrected (This Run)

### 4.1 ReserveService — Class-level docstring referenced wrong formula

**File:** `src/reserve/reserve.service.ts`

The *implementation* of `reserveIndex()` was already correct (PR #306 fixed the formula logic).
However, the class-level JSDoc still described the old wrong formula:

**Before (wrong docstring):**
```
it grows with the aggregate volume of PoT-verified processes AND with the AFC share
of every epoch's commission pool
canonical formula: reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)
```

**After (corrected docstring):**
```
it grows with the aggregate volume of PoT-verified processes
canonical formula: reserveIndex = log10(1 + totalProcessVolume)
AFC commission accruals are recorded in NodeChain for audit (I3) but do not enter
the reserveIndex formula — they are commission derivatives, not direct confirmed volume
```

### 4.2 `totalAfcReserve()` docstring implied price-index influence

The `totalAfcReserve()` method docstring said "Growing with epoch settlements drives the price
index upward over time" — implying AFC accruals enter `reserveIndex`. They do not. Corrected to
"Exposed for audit queries; this figure does not enter the `reserveIndex` formula".

---

## 5. Invariant Impact

| ID | Rule | Impact |
|----|------|--------|
| I1 | Value only on verified === 1 | Unaffected — emission gate untouched |
| I2 | Every emission bound to confirmed process | Unaffected |
| I3 | All significant events in NodeChain | AFC accrual still recorded → compliant |
| I4 | Deterministic: same input → same result | `reserveIndex` still deterministic from NodeChain |
| I5 | Process part nets to 0 | Unaffected |
| I6 | `totalSupply = earnedRetained` after burns | Unaffected |
| I7 | Pool reconciles: `paid + margin == fees` | Unaffected |
| I8 | NodeChain append-only | Unaffected |
| I9 | Node influence from work+reputation | Unaffected |
| I10 | Eye passive: no state change | Unaffected |
| I-RS-1 | Grows only from confirmed volume | Docstring now correctly states this |
| I-RS-2 | Derivable from NodeChain | Still holds — recomputed from history each call |
| I-RS-4 | Monotonic non-decreasing | Still holds — log(1 + volume) is monotonic |

---

## 6. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit only)
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (after process):     log10(1 + 10_000) ≈ 4.0000
internalPrice = base × 4.0000    → rises with each additional confirmed process
AFC accrual   → NodeChain record  → does NOT increase reserveIndex
```

---

## 7. Files Changed

```
src/reserve/reserve.service.ts    Class-level docstring corrected:
                                  - removed "AND with the AFC share of every epoch's commission pool"
                                  - formula corrected from log10(1 + totalProcessVolume + totalAfcReserve)
                                    to log10(1 + totalProcessVolume)
                                  - clarified AFC accruals are audit-trail only, not formula inputs
                                  totalAfcReserve() docstring: removed implication of price-index influence

AGENT_CORE_REPORT.md              This report (updated for current run)
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula logic aligned with spec: removed `totalAfcReserve` from computation |
| **This run** | `claude/inspiring-cannon-q8mqt4` | Docstrings aligned with corrected formula; no logic changes |
