# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-oxqtx6`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; not executable, not authoritative |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/token/` | **Does not exist** — referenced in 01_coin_engine docs as old path | N/A |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Docstring corrected this run** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation (source of truth) | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Definitive on formula |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Definitive on formula |

**Note on `01_coin_engine/`:** This is documentation-only, not deprecated code. It refers to
`src/token/emission.service.ts` — a path that no longer exists. Production emission logic lives
in `src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`. The `01_coin_engine/`
formula `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` is the historical Model-A formula
and is superseded by the Model-1 spec.

---

## 2. Canonical Model (verified against specs and reference)

```
Emission     = Transaction Amount                              (1:1, no multiplier)
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

Authority chain: `docs/specs/AST_Reserve_AGENT_EN.md` → `reference/ast-core/src/reserve.ts`.
Both agree: formula uses `totalProcessVolume` only, not `totalAfcReserve`.

---

## 3. Implementation Conformance

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated, then burn | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1`; records in NodeChain | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission post-factum | Distribution only after PoT confirms `verified === 1` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch | ✓ Correct (I7) |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |
| `ReserveService.reserveIndex()` **code** | `log10(1 + totalProcessVolume)` | ✓ Correct |
| `ReserveService` **docstring** | Must say `log10(1 + totalProcessVolume)` only | ✓ Fixed this run |

---

## 4. Deviation Found and Corrected This Run

### 4.1 ReserveService — Class-level docstring formula

**File:** `src/reserve/reserve.service.ts`

The class-level JSDoc described the canonical formula as:
```
reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)
```

Both the authoritative spec and reference disagree:

**Spec** (`docs/specs/AST_Reserve_AGENT_EN.md`):
```yaml
formulas:
  reserveIndex: "reserveIndex = log10(1 + totalProcessVolume)"
```

**Reference** (`reference/ast-core/src/reserve.ts`):
```typescript
reserveIndex(): number { return log10(1 + this.totalProcessVolume); }
```

The `reserveIndex()` method implementation was already correct — using only `totalProcessVolume`.
The docstring was the error. **Fix:** updated the class-level JSDoc to state the spec-correct formula
and clarify that AFC accruals are NodeChain audit records only (per I-RS-1), not formula inputs.

**Root cause:** A previous agent added `+ totalAfcReserve` to the docstring to express "AFC Reserve
grows → price rises". The intent is correct — the price does rise through `reserveIndex` as more
confirmed work accumulates — but the mechanism is `totalProcessVolume`, not a direct AFC term.
Including AFC in the formula would violate I-RS-1 ("grows only from confirmed volume").

---

## 5. Invariant Impact (unchanged — code was already correct)

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Emission gate untouched |
| I2 | Every emission bound to confirmed process | ✓ Unaffected |
| I3 | All significant events in NodeChain | ✓ AFC accrual still recorded |
| I4 | Deterministic: same input → same result | ✓ `reserveIndex` deterministic from NodeChain |
| I5 | Process part nets to 0 | ✓ Unaffected |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Unaffected |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ Unaffected |
| I8 | NodeChain append-only | ✓ Unaffected |
| I9 | Node influence from work+reputation | ✓ Unaffected |
| I10 | Eye passive: no state change | ✓ Unaffected |
| I-RS-1 | Grows only from confirmed volume | ✓ Formula correct; docstring now matches |
| I-RS-2 | Derivable from NodeChain | ✓ Recomputed from history each call |
| I-RS-4 | Monotonic non-decreasing | ✓ `log10(1 + volume)` is monotonic |

---

## 6. Transaction Example: $10,000

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

## 7. Files Changed This Run

```
src/reserve/reserve.service.ts    Class-level docstring corrected:
                                  "reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)"
                                  → "reserveIndex = log10(1 + totalProcessVolume)"
                                  AFC accrual role clarified as NodeChain audit only (I-RS-1)

AGENT_CORE_REPORT.md              This report
```

---

## 8. Audit Trail

| Run | Branch | Action |
|-----|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula corrected in code: removed `totalAfcReserve` |
| **This run** | `claude/inspiring-cannon-oxqtx6` | Class-level docstring aligned with spec; code confirmed canonical |
