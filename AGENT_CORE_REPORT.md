# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-xppudl`  
**Date:** 2026-06-19  
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Status |
|------|---------|--------|
| `01_coin_engine/` | Documentation only (aro_emission_protocol.md, coin_emission_model.md, etc.) | Docs; no executable code |
| `10_proof_of_transaction_engine/` | PoT documentation (pot_engine_overview.md, etc.) | Docs; no executable code |
| `src/token/` | **Does not exist** | No legacy token module found |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Docstring corrected** |
| `src/pot/pot.service.ts` | NestJS PoTService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference Model-1 emission | Read ✓ |
| `reference/ast-core/src/commission.ts` | Reference Model-1 commission | Read ✓ |
| `reference/ast-core/src/orchestrator.ts` | Reference Model-1 orchestrator | Read ✓ |

`src/token/` does not exist. The production emission logic lives entirely in  
`src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.  
`01_coin_engine/` is documentation only — not deprecated code.

---

## 2. Canonical Model (verified against task spec)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (0.5%)
  Node Share = C × 0.75    → nodes, post-factum by PoT weight (75%)
  AFC Share  = C × 0.25    → Reserve AFC, recorded in NodeChain (25%)

ARO lifecycle per confirmed process:
  PoT verify: verdict.verified === 1 required
  MINT(amount)  ← 1:1 with transaction amount
  … process executes …
  BURN(amount)  ← cycle completion; net = 0

Reserve:
  reserveIndex = log10(1 + totalProcessVolume)   ← confirmed volume only
  internalPrice = base × reserveIndex            ← rises as confirmed work accumulates
  AFC accruals → NodeChain (audit trail, not in formula)
```

---

## 3. Conformance Check — All Components

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), gated on `verdict.verified === 1` | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1`; records `emission.minted` in NodeChain | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; records `emission.burned`; process net → 0 | ✓ Correct |
| `ArosCoinService` ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `ArosCoinService` | No deposit/purchase path (I-AC-6) | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`; 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == totalFees` per epoch within epsilon (I7) | ✓ Correct |
| Commission timing | Post-factum, gated by `pot.getVerdict` per process (I-CM-1/I-CM-2) | ✓ Correct |
| `PotService.verify()` | Binary verdict `{0,1}`; idempotent; recorded in NodeChain before valid (I-PoT-4/5) | ✓ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — confirmed volume only | ✓ Correct (impl) |
| `ReserveService` class docstring | Formula stated `+ totalAfcReserve` — incorrect vs spec and impl | **Fixed** |
| NodeChain | Append-only, hash-continuous (I8) | ✓ Correct |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations (I10) | ✓ Correct |

---

## 4. Deviation Found and Corrected

### 4.1 ReserveService class docstring — incorrect formula statement

**File:** `src/reserve/reserve.service.ts`

**Nature:** Documentation bug only. The `reserveIndex()` implementation has always been
correct (`log10(1 + totalProcessVolume)`). The class-level docstring above the
implementation incorrectly stated:

```
reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)
```

and described the index as growing "AND with the AFC share of every epoch's commission pool".
This contradicts spec I-RS-1 ("grows only from confirmed volume") and the actual method body.

**Fix applied:**

```
// Before (incorrect docstring):
// `reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)`
// "grows with ... AND with the AFC share ..."

// After (correct docstring, matches implementation and spec I-RS-1):
// `reserveIndex = log10(1 + totalProcessVolume)`
// AFC accruals are recorded for audit but do not enter this formula.
```

The `totalAfcReserve()` method and `addAfcAccrual()` remain unchanged — AFC events are still
recorded in NodeChain for audit (I3). Only the class docstring text was corrected.

---

## 5. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT verified === 1)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum per epoch)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain audit event
Burn          = 10,000 ARO   ← BURN (net circulating change from process part = 0)

reserveIndex (after this process):    log10(1 + 10_000) ≈ 4.0000
internalPrice = base × 4.0000        → rises with each additional confirmed process
totalSupply after completed epoch:    37.50 ARO (earnedRetained by nodes)
```

---

## 6. Invariant Status

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on `verified === 1` | ✓ Upheld — emission gate unchanged |
| I2 | Every emission bound to confirmed process | ✓ Upheld |
| I3 | All significant events in NodeChain | ✓ AFC accrual still recorded |
| I4 | Deterministic: same input → same result | ✓ All derivations from NodeChain |
| I5 | Process part nets to 0 | ✓ Upheld — mint == burn |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Upheld |
| I7 | Pool reconciles: `paid + margin == fees` per epoch | ✓ Upheld |
| I8 | NodeChain append-only | ✓ Upheld |
| I9 | Node influence from work+reputation only | ✓ Upheld — no stake fields |
| I10 | Eye passive: no state change | ✓ Upheld |
| I-RS-1 | Grows only from confirmed volume | ✓ Formula uses only `totalProcessVolume` |
| I-RS-2 | Derivable from NodeChain history | ✓ Recomputed each call |
| I-RS-4 | Monotonic non-decreasing | ✓ `log10(1+volume)` is monotonic |

---

## 7. Files Changed

```
src/reserve/reserve.service.ts    Class docstring corrected: removed "+ totalAfcReserve"
                                  from formula statement; aligned with implementation and
                                  spec I-RS-1. No logic changes.

AGENT_CORE_REPORT.md             This report.
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR (prev) | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula corrected in implementation |
| **This run** | `claude/inspiring-cannon-xppudl` | Class docstring in ReserveService aligned with implementation and spec I-RS-1 |
