# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-5f6t8d`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical model; correct any deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | 11 `.md` files + `AROS_Coin_TokenSpec.json` | Historical Model-A docs; documentation only, no executable code |
| `10_proof_of_transaction_engine/` | 9 `.md` files | PoT documentation; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Docstring corrected** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Cross-checked |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Definitive on formula |

`src/token/` does not exist. Production emission logic lives in `src/emission/`,
`src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` is documentation only (Model-A historical). No executable content
resides there; it is not a deprecated module but a narrative layer.

---

## 2. Canonical Model (verified against specs and reference)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; processNet = 0

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)               ← spec I-RS-1: confirmed volume only
  internalPrice = base × reserveIndex                         ← rises as confirmed work accumulates
  AFC accruals  → NodeChain (audit trail only, not in formula)
```

Sources of authority (highest first): `docs/specs/AST_Emission_AGENT_EN.md`,
`docs/specs/AST_Reserve_AGENT_EN.md`, `reference/ast-core/src/emission.ts`,
`reference/ast-core/src/reserve.ts`.

---

## 3. Conformance Check

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated, then immediately burn | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; processNet → 0 (I5) | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == totalFees` per epoch (I7) | ✓ Correct |
| `ReserveService.reserveIndex()` — implementation | `log10(1 + totalProcessVolume)` | ✓ Correct |
| `ReserveService.reserveIndex()` — method docstring | `log10(1 + totalProcessVolume)` | ✓ Correct |
| `ReserveService` class docstring | **Was:** `log10(1 + totalProcessVolume + totalAfcReserve)` | **Fixed** |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct |
| NodeChain recording | `emission.minted` + `emission.burned` events appended | ✓ Correct |
| Nodes | Work+reputation weight; no stake/slashing fields (I9/P1/P2) | ✓ Correct |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations (I10/P6) | ✓ Correct |

---

## 4. Deviation Found and Corrected

### 4.1 ReserveService — Stale Class-Level Docstring

**File:** `src/reserve/reserve.service.ts` (lines 12–13)

The class-level docstring referenced the old, incorrect formula from a prior session:

```
// Before (stale — contradicted the implementation below it):
reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)

// After (aligned with spec I-RS-1 and method-level docstring):
reserveIndex = log10(1 + totalProcessVolume)
```

The actual `reserveIndex()` method implementation and its own inline docstring were already
correct (`log10(1 + totalProcessVolume)`) from PR #306. Only the class-level summary
paragraph retained the old formula string, creating a misleading discrepancy between the
narrative and the implementation.

**Spec authority:** `docs/specs/AST_Reserve_AGENT_EN.md`:
```yaml
formulas:
  reserveIndex: "reserveIndex = log10(1 + totalProcessVolume)"
```

**Reference authority:** `reference/ast-core/src/reserve.ts`:
```typescript
reserveIndex(): number { return log10(1 + this.totalProcessVolume); }
```

**What stays unchanged:** The `addAfcAccrual()` method still records AFC events in
NodeChain (correct per I3 — every significant event recorded). `totalAfcReserve()` still
reads that history. AFC routing from Commission is correct and untouched.

---

## 5. Transaction Example: $10,000

```
TX Amount     = 10,000
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit)
Burn          = 10,000 ARO   ← BURN (processNet = 0)

After process:
  processMinted  = 10,000
  processBurned  = 10,000
  earnedRetained = 37.50 (after epoch finalization)
  totalSupply    = (10,000 − 10,000) + 37.50 = 37.50 ARO

reserveIndex (after process): log10(1 + 10,000) ≈ 4.0000
internalPrice = base × 4.0000  → rises with each additional confirmed process
```

---

## 6. Invariant Impact

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Unaffected — emission gate untouched |
| I2 | Every emission bound to confirmed process | ✓ Unaffected |
| I3 | All significant events in NodeChain | ✓ AFC accrual still recorded |
| I4 | Deterministic: same input → same result | ✓ reserveIndex still deterministic |
| I5 | Process part nets to 0 | ✓ Unaffected |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Unaffected |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ Unaffected |
| I8 | NodeChain append-only | ✓ Unaffected |
| I9 | Node influence from work+reputation | ✓ Unaffected |
| I10 | Eye passive: no state change | ✓ Unaffected |
| I-RS-1 | Grows only from confirmed volume | ✓ Formula uses only process volume |
| I-RS-2 | Derivable from NodeChain | ✓ Recomputed from history each call |
| I-RS-4 | Monotonic non-decreasing | ✓ log(1 + volume) is monotonic |

---

## 7. Files Changed

```
src/reserve/reserve.service.ts    Class-level docstring corrected:
                                  "log10(1 + totalProcessVolume + totalAfcReserve)"
                                  → "log10(1 + totalProcessVolume)"  [spec I-RS-1]

AGENT_CORE_REPORT.md              This report (refreshed from 2026-06-18)
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula corrected in implementation and method docstring |
| **This run** | `claude/inspiring-cannon-5f6t8d` | `ReserveService` class docstring aligned with spec; full audit confirms canonical 1:1 model |
