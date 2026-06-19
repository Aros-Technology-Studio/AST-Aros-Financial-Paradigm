# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-23gn8v`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical 1:1 model; correct any deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation (coin_emission_model.md, aro_emission_protocol.md, etc.) | Historical Model-A docs; rates cross-checked against specs |
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

`src/token/` does not exist — there is no legacy `token/` module.
Production emission logic lives entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.
Module `01_coin_engine/` is documentation only, not executable code.

---

## 2. Canonical Model (verified against specs and reference)

```
Emission     = Transaction Amount                              (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                    (canonical 0.5%)
  Node Share = C × 0.75                                       (75% → nodes post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verdict.verified === 1 required
  … process executes …
  BURN(amount)  ← cycle completion; net processMinted − processBurned = 0

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)   ← spec formula (docs/specs/AST_Reserve_AGENT_EN.md)
  internalPrice = base × reserveIndex             ← rises as confirmed work accumulates
  AFC accruals  → NodeChain (audit trail), not in formula

Supply identity (I6):
  totalSupply = (processMinted − processBurned) + earnedRetained
  After burns: totalSupply == earnedRetained
```

### Example: 10,000 ARO transaction
```
TX Amount    = 10,000 ARO
Emission     = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission   = 10,000 × 0.005 = 50 ARO
  Node Share = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (epoch finalization, post-factum)
  AFC Reserve= 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain audit event
Burn         = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (after process): log10(1 + 10_000) ≈ 4.000
internalPrice grows with each additional confirmed process
```

---

## 3. Conformance Verdict: Fully Canonical

All production services are conformant with the canonical model. No deviations found in this session.

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; processNet → 0 | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) per canonical spec | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) per canonical spec | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission post-factum payment | Payment gated on PoT `verified === 1`; only confirmed work earns | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | ✓ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` | ✓ Correct (corrected PR #306) |
| PoT gate | Binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| OrchestratorService lifecycle | initiation → admissibility → assignment → execution → PoT → emission → fee → reserve → final | ✓ Correct |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work + reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |

---

## 4. Prohibition Scan Results (P1–P8)

Grep scan of `src/**/*.ts` for prohibited constructs:

| Prohibition | Constructs Checked | Result |
|-------------|-------------------|--------|
| P1 — staking / stakedBalance / stake_freeze | Found only in test assertions verifying absence | ✓ Pass |
| P2 — slashing against balance or stake | Found only in test assertions verifying absence | ✓ Pass |
| P3 — token-weighted governance | Not found | ✓ Pass |
| P4 — farming / passive yield for holding | Not found | ✓ Pass |
| P5 — mint-on-deposit / crypto_to_aroscoin | Not found | ✓ Pass |
| P6 — Eye halting / voting / state-change | Not found | ✓ Pass |
| P7 — emission outside confirmed-process logic | Not found | ✓ Pass |
| P8 — negative definitions in comments | Not found | ✓ Pass |

All matches in `src/nodes/nodes.service.spec.ts`, `src/nodes/nodes.service.ts`, and
`src/invariants/invariants.spec.ts` are assertions verifying that prohibited constructs
do not exist (compliance tests for I9/P1/P2), not implementations of them.

---

## 5. Invariant Coverage

| ID | Rule | Test | Status |
|----|------|------|--------|
| I1 | Value exists only on PoT verified === 1 | `invariants.spec.ts → I1` | ✓ Tested |
| I2 | Every emission bound to confirmed process | `invariants.spec.ts → I2` | ✓ Tested |
| I3 | All significant events in NodeChain | `invariants.spec.ts → I3` | ✓ Tested |
| I4 | Deterministic: same input → same result | `invariants.spec.ts → I4` | ✓ Tested |
| I5 | Process part nets to 0 (minted == burned) | `invariants.spec.ts → I5` | ✓ Tested |
| I6 | totalSupply == earnedRetained after burns | `invariants.spec.ts → I6` | ✓ Tested |
| I7 | Commission pool reconciles per epoch | `invariants.spec.ts → I7` | ✓ Tested |
| I8 | NodeChain append-only and hash-continuous | `invariants.spec.ts → I8` | ✓ Tested |
| I9 | Node influence from work + reputation only | `invariants.spec.ts → I9` | ✓ Tested |
| I10 | Eye passive: no state mutation | `invariants.spec.ts → I10` | ✓ Tested |

---

## 6. Historical Deviations (corrected in prior sessions)

### 6.1 ReserveService — `reserveIndex()` Formula (corrected PR #306)

**File:** `src/reserve/reserve.service.ts`

A prior agent had used `log10(1 + totalProcessVolume + totalAfcReserve)`, adding the AFC
accrual amount to the index formula. The spec (`docs/specs/AST_Reserve_AGENT_EN.md`) and
reference (`reference/ast-core/src/reserve.ts`) both define the index from confirmed process
volume only:

```
reserveIndex = log10(1 + totalProcessVolume)   // spec + reference
```

This was corrected in branch `claude/inspiring-cannon-4m9xnj` (PR #306). The current
production code is correct. AFC accruals continue to be recorded in NodeChain for audit.

---

## 7. Files Changed This Session

```
AGENT_CORE_REPORT.md   Updated with full 2026-06-19 audit (no code changes required)
```

No production code required changes — the emission implementation is fully canonical.

---

## 8. Session Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec |
| **This run** | `claude/inspiring-cannon-23gn8v` | Full re-audit; code confirmed fully canonical; no deviations found |
