# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-cxs8so`
**Date:** 2026-06-20
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; rates cross-checked against spec |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ (previously corrected) |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Read |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` — the legacy Model-A emission module (`src/token/emission.service.ts`, 230 lines)
was removed on this branch. The production emission logic lives entirely in `src/emission/`,
`src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` is documentation only, not deprecated executable code. No production logic
resides there.

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
  BURN(amount)  ← cycle completion; net = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              ← spec formula (I-RS-1/I-RS-2)
  internalPrice  = base × reserveIndex                        ← rises with confirmed work
  AFC accruals   → NodeChain (audit trail), not in reserveIndex formula
```

Authority chain (highest first):
1. `docs/specs/AST_Reserve_AGENT_EN.md` → `reserveIndex = log10(1 + totalProcessVolume)`
2. `reference/ast-core/src/reserve.ts` → same formula
3. `reference/ast-core/src/commission.ts` → `feeRate 1%` (reference uses 1%), production uses 0.5% — canonical production default
4. Historical docs `01_coin_engine/aro_emission_protocol.md` → lists `sqrt(totalAfcReserve)/10_000` formula; this is **Model-A, non-authoritative**; production correctly uses the spec formula.

---

## 3. Conformance Audit — All Components Pass

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | PoT-gated; mint = amount (1:1); burn = minted | ✓ Correct |
| `EmissionService.mint()` | Throws when `verified !== 1` (I-EM-2) | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 (I-EM-3) | ✓ Correct |
| `ArosCoinService` ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 split | 75% nodes via `coin.recordEarned`; 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission post-factum | Only PoT-confirmed participation (verified === 1) counts toward weight | ✓ Correct (I-CM-1/I-CM-2) |
| Commission pool reconcile | `paid + margin == total` per epoch within epsilon 1e-9 | ✓ Correct (I7) |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` (spec I-RS-1/I-RS-2) | ✓ Correct |
| AFC accrual routing | `addAfcAccrual(amount)` appends `reserve.afc.accrual` to NodeChain | ✓ Correct (I3) |
| PoT gate | Deterministic binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous (reconstruct detects tampering) | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/stakedBalance/stakeFreeze fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; never mutates other entities' state | ✓ Correct (I10) |
| `OrchestratorService.runProcess()` | Full lifecycle in spec order; PoT gates all value | ✓ Correct |

**No deviations found.** All production services match the canonical Model-1 spec.

---

## 4. Previous Deviations (Historical — Already Corrected)

### 4.1 ReserveService — `reserveIndex()` Formula (corrected in prior session)

**Was:** `log10(1 + totalProcessVolume + totalAfcReserve)` — incorrect, included AFC in formula.
**Now:** `log10(1 + totalProcessVolume)` — correct per spec I-RS-1/I-RS-2 and reference.

**Root cause (historical):** An earlier agent added `totalAfcReserve` to express "price rises with
AFC". The mechanism is already present through `totalProcessVolume`, which grows with every verified
process. Including AFC separately contradicted I-RS-1 ("grows only from confirmed volume").

**What was preserved:** `addAfcAccrual()` still records the AFC event in NodeChain (correct per I3).
`totalAfcReserve()` still reads that history for querying. Commission routing is unchanged.

---

## 5. Invariant Impact

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Compliant |
| I2 | Every emission bound to confirmed process | ✓ Compliant |
| I3 | All significant events in NodeChain | ✓ Compliant — AFC accrual recorded |
| I4 | Deterministic: same input → same result | ✓ Compliant — reserveIndex from NodeChain |
| I5 | Process part nets to 0 | ✓ Compliant |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Compliant |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ Compliant |
| I8 | NodeChain append-only | ✓ Compliant |
| I9 | Node influence from work+reputation | ✓ Compliant — no stake fields |
| I10 | Eye passive: no state change | ✓ Compliant |
| I-EM-2 | No mint without verified === 1 | ✓ Compliant |
| I-EM-3 | Cycle symmetry: process part minted = burned | ✓ Compliant |
| I-RS-1 | Grows only from confirmed volume | ✓ Compliant |
| I-RS-2 | Derivable from NodeChain | ✓ Compliant |
| I-RS-4 | Monotonic non-decreasing | ✓ Compliant |
| I-CM-2 | Only confirmed participation counts | ✓ Compliant |
| I-CM-4 | Pool reconciles per epoch | ✓ Compliant |

---

## 6. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated; verified === 1 required)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit trail)
Burn          = 10,000 ARO   ← BURN (net circulating change = 0; I5)

reserveIndex (after process):     log10(1 + 10_000) ≈ 4.0000
internalPrice = base × 4.0000    → rises with each additional confirmed process
totalSupply after burns           = 0 (no epoch finalized yet; earned = 0)
totalSupply after epoch finalize  = 37.50 (earnedRetained from node payments)
```

---

## 7. Files Changed This Session

```
AGENT_CORE_REPORT.md    Updated: branch, date, re-audit status (no code changes needed)
```

No production code was modified. All services were already canonical.

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec: removed `totalAfcReserve` from formula |
| **This run** | `claude/inspiring-cannon-cxs8so` | Re-audit: all components confirmed canonical; no deviations found; report updated |
