# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-s9kpji`
**Date:** 2026-06-20
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; not authoritative for rates/formulas |
| `10_proof_of_transaction_engine/` | PoT documentation only | Historical; no emission formulas |
| `src/token/` | **Does not exist** | Path is stale in Model-A docs |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **JSDoc corrected** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Read |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |

**Key finding on `01_coin_engine/`:** Module is documentation only, not deprecated code.
No executable content. The file `coin_emission_model.md` contains stale Model-A references
(`src/token/emission.service.ts`, wrong `reserveIndex` formula) — these are historical and
non-authoritative per CLAUDE.md. Production code in `src/` is the live implementation.

---

## 2. Canonical Model (verified against reference and specs)

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
  reserveIndex  = log10(1 + totalProcessVolume)              ← spec formula (I-RS-1/I-RS-2)
  internalPrice = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals  → recorded in NodeChain (audit trail), do not enter the formula
```

---

## 3. Conformant — Code Matches Canonical Model

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
| `ReserveService.reserveIndex()` **formula** | `log10(1 + totalProcessVolume)` | ✓ Correct |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |

---

## 4. Deviation Found and Corrected

### 4.1 ReserveService — stale class-level JSDoc

**File:** `src/reserve/reserve.service.ts`

The **implementation** of `reserveIndex()` was already correct (`log10(1 + totalProcessVolume)`),
but the **class-level JSDoc** still carried the old incorrect description from a previous session:

```
// Before (stale):
// "canonical formula `reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)`"

// After (aligned with spec I-RS-1/I-RS-2 and reference):
// "canonical formula `reserveIndex = log10(1 + totalProcessVolume)`"
```

The erroneous mention of `totalAfcReserve` in the formula description was misleading. The method
JSDoc and the implementation were already correct; only the class description paragraph was stale.

**What stays unchanged:** `addAfcAccrual()` still records AFC events in NodeChain (correct per I3).
`totalAfcReserve()` still reads that history for audit/query purposes. The actual formula is
untouched — it was already computing the right value.

---

## 5. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit)
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (after process):     log10(1 + 10,000) ≈ 4.0000
internalPrice = base × 4.0000    → rises with each additional confirmed process
```

---

## 6. Invariant Coverage

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Tested in invariants.spec.ts |
| I2 | Every emission bound to confirmed process | ✓ Tested |
| I3 | All significant events in NodeChain | ✓ Tested |
| I4 | Deterministic: same input → same result | ✓ Tested |
| I5 | Process part nets to 0 | ✓ Tested |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Tested |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ Tested |
| I8 | NodeChain append-only | ✓ Tested |
| I9 | Node influence from work+reputation | ✓ Tested |
| I10 | Eye passive: no state change | ✓ Tested |
| I-RS-1 | Index grows only from confirmed volume | ✓ Formula uses only `totalProcessVolume` |
| I-RS-2 | Derivable from NodeChain | ✓ Recomputed from history each call |
| I-RS-4 | Monotonic non-decreasing | ✓ `log10(1 + v)` is monotonic |

---

## 7. Files Changed

```
src/reserve/reserve.service.ts    Class-level JSDoc aligned with spec:
                                  stale "... + totalAfcReserve" removed from formula description.
                                  Implementation was already correct — no logic change.

AGENT_CORE_REPORT.md              This report (updated for 2026-06-20 session)
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #... | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula corrected in implementation |
| **This run** | `claude/inspiring-cannon-s9kpji` | Class-level JSDoc in `reserve.service.ts` aligned with correct formula; full conformance audit passed |
