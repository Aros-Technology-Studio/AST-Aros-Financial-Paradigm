# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-09aq2v`  
**Date:** 2026-06-20  
**Task:** Audit ArosCoin emission logic against the canonical model; correct any deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|----------|
| `01_coin_engine/` | Documentation (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; not authoritative |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical docs; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Doc corrected** |
| `src/pot/pot.service.ts` | NestJS PoTService (verdict engine) | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Definitive formula source |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read ✓ |

`src/token/` does not exist — the historical `01_coin_engine/coin_emission_model.md`
references `src/token/emission.service.ts` which is Model-A legacy. Production emission
lives entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` is documentation-only; no executable code resides there.

---

## 2. Canonical Model (verified against reference + spec)

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
  reserveIndex   = log10(1 + totalProcessVolume)              ← spec I-RS-1; confirmed volume only
  internalPrice  = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals   → NodeChain (audit trail) only; NOT in reserveIndex formula
```

Sources of authority (highest first):
1. `docs/specs/AST_Reserve_AGENT_EN.md` — `reserveIndex = log10(1 + totalProcessVolume)`
2. `reference/ast-core/src/reserve.ts` — `reserveIndex(): number { return log10(1 + this.totalProcessVolume); }`

Both agree: only `totalProcessVolume` enters the formula.

---

## 3. Audit Results

### 3.1 Code — All Correct, No Changes Needed

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|--------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated (verified === 1) | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | ✓ Correct |
| `ReserveService.reserveIndex()` **implementation** | `log10(1 + totalProcessVolume)` | ✓ Correct |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |

### 3.2 Documentation Deviation — Corrected

**File:** `src/reserve/reserve.service.ts` — class-level doc comment  
**Problem:** The class-level JSDoc stated the formula as
`reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)`, which contradicts:
- spec `docs/specs/AST_Reserve_AGENT_EN.md` (I-RS-1)
- `reference/ast-core/src/reserve.ts`
- the `reserveIndex()` method's own doc and implementation (which correctly uses `totalProcessVolume` only)

This is a documentation inconsistency introduced by a previous session that fixed the *code* but left the *class-level description* unrewritten.

| | Before (deviated) | After (spec-correct) |
|--|------|------|
| Class-level formula | `log10(1 + totalProcessVolume + totalAfcReserve)` | `log10(1 + totalProcessVolume)` |
| AFC event description | "grows the reserve as epochs are settled" | "available for reporting; does not enter `reserveIndex` formula" |
| Class description line | "grows... AND with the AFC share of every epoch's commission pool" | "grows with the aggregate volume of PoT-verified processes" |

**Root cause:** A previous run (branch `claude/inspiring-cannon-4m9xnj`) correctly fixed the
implementation to remove `totalAfcReserve` from the formula, but the class-level JSDoc was
not updated to match, leaving a misleading description visible to all readers of the file.

**Impact on invariants:** None — only the doc changed. The implementation was already correct.

---

## 4. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated, verified === 1)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit only)
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (after process):     log10(1 + 10_000) ≈ 4.0000
internalPrice = base × 4.0000    → rises with each additional confirmed process
```

---

## 5. Invariant Status After This Run

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Unchanged — emission gate correct |
| I2 | Every emission bound to confirmed process | ✓ Unchanged |
| I3 | All significant events in NodeChain | ✓ AFC accrual still recorded → compliant |
| I4 | Deterministic: same input → same result | ✓ `reserveIndex` still deterministic |
| I5 | Process part nets to 0 | ✓ Unchanged |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Unchanged |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ Unchanged |
| I8 | NodeChain append-only | ✓ Unchanged |
| I9 | Node influence from work+reputation | ✓ Unchanged |
| I10 | Eye passive: no state change | ✓ Unchanged |
| I-RS-1 | Grows only from confirmed volume | ✓ Code correct; doc now matches |
| I-RS-2 | Derivable from NodeChain | ✓ Holds — recomputed from history |
| I-RS-4 | Monotonic non-decreasing | ✓ Holds — log(1 + volume) is monotonic |

---

## 6. Files Changed

```
src/reserve/reserve.service.ts    class-level JSDoc corrected:
                                  formula description: log10(1 + totalProcessVolume + totalAfcReserve)
                                  → log10(1 + totalProcessVolume)   [matches spec I-RS-1 and reference]
                                  AFC event description: clarified as audit-only, not formula input

AGENT_CORE_REPORT.md              This report (updated for 2026-06-20 run on claude/inspiring-cannon-09aq2v)
```

---

## 7. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR on branch | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` implementation aligned: removed `totalAfcReserve` from formula |
| **This run** | `claude/inspiring-cannon-09aq2v` | Class-level JSDoc in `reserve.service.ts` aligned with implementation and spec |
