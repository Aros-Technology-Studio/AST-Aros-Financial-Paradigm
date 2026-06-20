# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-4z3vv6`
**Date:** 2026-06-20
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; no executable code |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Docstring corrected** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Read |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` does not exist — no legacy `token/` module is present. The production
emission logic lives entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`,
and `src/reserve/`.

Module `01_coin_engine/` contains documentation only, not deprecated executable code.

---

## 2. Canonical Model (verified against specs and reference)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; net = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              ← confirmed volume only (spec I-RS-1)
  internalPrice  = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals   → NodeChain (audit trail only, not in formula)
```

Sources of authority: `docs/specs/AST_Reserve_AGENT_EN.md`, `reference/ast-core/src/reserve.ts`.

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
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | ✓ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — AFC accruals excluded from formula | ✓ Code correct |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |

---

## 4. Deviation Found and Corrected

### 4.1 ReserveService — Class Docstring Formula Mismatch

**File:** `src/reserve/reserve.service.ts`

The previous agent run (PR session `claude/inspiring-cannon-4m9xnj`) correctly fixed
`reserveIndex()` implementation but left the class-level docstring containing the stale
pre-fix formula.

| | Before (stale docstring) | After (corrected) |
|--|------|------|
| Class docstring formula | `reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)` | `reserveIndex = log10(1 + totalProcessVolume)` |
| Class prose | "grows with PoT volume AND AFC share" | "grows with PoT-verified processes" + explicit note AFC is audit-only |
| `reserveIndex()` implementation | `log10(1 + volume)` ← already correct | unchanged ✓ |

The `reserveIndex()` method implementation was already correct from the prior fix; only the
class documentation was inconsistent. This corrects it so the docstring matches both the code
and the spec.

**Spec authority:** `docs/specs/AST_Reserve_AGENT_EN.md`:
```yaml
formulas:
  reserveIndex: "reserveIndex = log10(1 + totalProcessVolume)"
```

**Reference authority:** `reference/ast-core/src/reserve.ts`:
```typescript
reserveIndex(): number { return log10(1 + this.totalProcessVolume); }
```

---

## 5. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit)
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (after process):     log10(1 + 10_000) ≈ 4.0000
internalPrice = base × 4.0000    → rises with each additional confirmed process
```

---

## 6. Invariant Status After This Run

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Emission gate untouched |
| I2 | Every emission bound to confirmed process | ✓ Correct |
| I3 | All significant events in NodeChain | ✓ AFC accrual still recorded |
| I4 | Deterministic: same input → same result | ✓ `reserveIndex` still deterministic |
| I5 | Process part nets to 0 | ✓ Correct |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Correct |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ Correct |
| I8 | NodeChain append-only | ✓ Correct |
| I9 | Node influence from work+reputation | ✓ Correct |
| I10 | Eye passive: no state change | ✓ Correct |
| I-RS-1 | Grows only from confirmed volume | ✓ Formula uses only process volume |
| I-RS-2 | Derivable from NodeChain | ✓ Recomputed from history each call |
| I-RS-4 | Monotonic non-decreasing | ✓ log(1 + volume) is monotonic |

---

## 7. Files Changed

```
src/reserve/reserve.service.ts    Class docstring corrected: stale formula
                                  "log10(1 + totalProcessVolume + totalAfcReserve)"
                                  → "log10(1 + totalProcessVolume)" with explicit note
                                  that AFC accruals are audit-only (spec I-RS-1).

AGENT_CORE_REPORT.md              This report (updated for this session).
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR (prev) | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula corrected in code: removed `totalAfcReserve` from implementation |
| **This run** | `claude/inspiring-cannon-4z3vv6` | Class docstring in `reserve.service.ts` aligned with corrected code and spec: stale formula removed |
