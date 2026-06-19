# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-nlgtpd`  
**Date:** 2026-06-19  
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|----------|
| `01_coin_engine/` | Documentation (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; cross-checked for formula discrepancies |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | **Audited ✓ CANONICAL** |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | **Audited ✓ CANONICAL** |
| `src/commission/commission.service.ts` | NestJS CommissionService | **Audited ✓ CANONICAL** |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Audited ✓ CANONICAL** |
| `reference/ast-core/src/emission.ts` | Reference implementation | Confirmed — PoT-gated mint/burn |
| `reference/ast-core/src/commission.ts` | Reference implementation | Confirmed — pool + distribution |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Confirmed — `log10(1 + vol)` |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Confirmed |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Definitive on formula |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Confirmed |

`src/token/` does **not** exist — this path appeared only in the stale Model-A
documentation (`01_coin_engine/coin_emission_model.md`). The production emission logic
lives entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

Module `01_coin_engine/` is **documentation only** — no executable code, not deprecated.

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
  reserveIndex  = log10(1 + totalProcessVolume)       ← spec formula, confirmed volume only
  internalPrice = base × reserveIndex                  ← rises as confirmed work accumulates
  AFC accruals  → NodeChain (audit trail), not in formula
```

Sources of authority (highest first):
1. `docs/specs/AST_Reserve_AGENT_EN.md` — `reserveIndex = log10(1 + totalProcessVolume)` (explicit)
2. `reference/ast-core/src/reserve.ts` — `reserveIndex(): number { return log10(1 + this.totalProcessVolume); }`
3. `reference/ast-core/src/emission.ts` — PoT-gated mint/burn pattern confirmed

---

## 3. Production Code — All Components Canonical

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated on `verified === 1` | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1`; records `emission.minted` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; records `emission.burned` | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| Process net | `processNet → 0` after cycle completes (I5) | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7, epsilon 1e-9) | ✓ Correct |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` from NodeChain history | ✓ Correct |
| AFC accruals | Recorded in NodeChain only; do not enter `reserveIndex` formula | ✓ Correct |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work + reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |

---

## 4. Documentation Deviation Found and Fixed

### 4.1 `01_coin_engine/coin_emission_model.md` — Wrong `reserveIndex` Formula

This documentation file contained a **Model-A** formula that contradicts the spec and
reference:

| | Before (Model-A, incorrect) | After (spec-correct) |
|--|------|------|
| Formula | `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000` | `reserveIndex = log10(1 + totalProcessVolume)` |
| Driver | AFC reserve accumulation | Confirmed process volume |
| Reference path | `src/token/emission.service.ts` (non-existent) | `src/emission/emission.service.ts` (correct) |

**Authority:** `docs/specs/AST_Reserve_AGENT_EN.md` is explicit:
```yaml
formulas:
  reserveIndex: "reserveIndex = log10(1 + totalProcessVolume)"
```
`reference/ast-core/src/reserve.ts` confirms:
```typescript
reserveIndex(): number { return log10(1 + this.totalProcessVolume); }
```

**Root cause:** The `coin_emission_model.md` was written as Model-A documentation and was
never updated when Model-1 formulas were established. It is a documentation artifact only —
it had no bearing on the production code, which was already correct.

**Production impact:** None. `src/reserve/reserve.service.ts` has implemented the correct
formula (`log10(1 + totalProcessVolume)`) since PR #298. This fix aligns the documentation
to match the code and spec.

---

## 5. Transaction Example: $10,000 (Verified Canonical)

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

## 6. Invariant Compliance

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Emission gate enforced in both `emit()` and `mint()` |
| I2 | Every emission bound to confirmed process | ✓ `processId` binds mint to PoT verdict |
| I3 | All significant events in NodeChain | ✓ `emission.minted`, `emission.burned`, `reserve.afc.accrual`, `commission.epoch.finalized` |
| I4 | Deterministic: same input → same result | ✓ Node IDs sorted; no randomness in distribution |
| I5 | Process part nets to 0 | ✓ `burn(amount) = minted`; `processNet → 0` |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Three-tally ledger; identity derivable |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ `Math.abs(paid + allocatedMargin - total) < 1e-9` |
| I8 | NodeChain append-only | ✓ No delete/update path |
| I9 | Node influence from work + reputation | ✓ No stake/slashing fields in NodesService |
| I10 | Eye passive: no state change | ✓ AllSeeingEye observe/compare/signal only |
| I-RS-1 | Grows only from confirmed volume | ✓ `log10(1 + totalProcessVolume)` from `emission.minted` events |
| I-RS-2 | Derivable from NodeChain | ✓ Recomputed from history on each call |
| I-RS-3 | Own value, not custody | ✓ No custodial paths |
| I-RS-4 | Monotonic non-decreasing | ✓ `log10(1 + volume)` is monotonic |

---

## 7. Files Changed This Session

```
01_coin_engine/coin_emission_model.md    reserveIndex formula corrected:
                                         sqrt-based Model-A formula → log10(1+totalProcessVolume)
                                         File path corrected:
                                         src/token/emission.service.ts → src/emission/emission.service.ts

AGENT_CORE_REPORT.md                     This report (updated)
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #? | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec |
| **This run** | `claude/inspiring-cannon-nlgtpd` | Confirmed all `src/` code canonical; fixed Model-A formula in `01_coin_engine/coin_emission_model.md` |
