# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `agent/core-emission`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation (coin_emission_model.md, burn_mechanism.md, etc.) | Historical Model-A docs; rates cross-checked |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Docstrings corrected |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` does not exist. The production emission logic lives entirely in
`src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` and `10_proof_of_transaction_engine/` are documentation-only folders
(historical, Model-A reference). No executable code resides there.

---

## 2. Canonical Model (as verified against specs)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% to nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% to Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  <- PoT verified === 1
  ... process executes ...
  BURN(amount)  <- cycle completion; net = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              <- spec formula; confirmed volume only
  internalPrice  = base x reserveIndex                        <- rises as confirmed work accumulates
  AFC accruals   -> NodeChain (audit trail only, not in formula)
```

Sources of authority (highest first): `docs/specs/AST_Reserve_AGENT_EN.md`,
`reference/ast-core/src/reserve.ts`. Both agree on the formula.

---

## 3. Implementation Conformance

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated; returns `{authorized:false}` when unverified | Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net to 0 | Correct |
| `ArosCoinService` 3-tally ledger | `totalSupply = (processMinted - processBurned) + earnedRetained` | Correct |
| `CommissionService.feeRate` | `0.005` (0.5%) | Correct |
| `CommissionService.marginRate` | `0.25` (25% AFC) | Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`; 25% via `reserve.addAfcAccrual` | Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch within 1e-9 | Correct (I7) |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — confirmed volume only | Correct (I-RS-1) |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | Correct (I10) |

---

## 4. Changes Made This Session (2026-06-19)

### 4.1 `src/reserve/reserve.service.ts` — Method Docstring Accuracy

The `reserveIndex()` implementation was already correct (formula uses `totalProcessVolume` only).
Two method-level docstrings still described AFC accruals as driving the price index,
contradicting the formula and spec I-RS-1.

**`totalAfcReserve()` docstring — before:**
```
Growing with epoch settlements drives the price index upward over time
```

**After:**
```
Provided for audit queries; this figure does not enter the reserveIndex formula (spec I-RS-1).
```

**`addAfcAccrual()` docstring — before:**
```
so the reserve index grows with each settled epoch
```

**After:**
```
The event is an audit record (spec I3); it does not enter the reserveIndex formula (spec I-RS-1).
```

**Rationale:** AFC accruals are commission derivatives routed to NodeChain as an audit trail.
The spec (`AST_Reserve_AGENT_EN.md`, I-RS-1) and the reference (`reserve.ts`) are unambiguous:
`reserveIndex` grows from confirmed process volume only. Docstrings claiming AFC drives the
index contradict spec I-RS-1 and violate the positive-language requirement (P8).

### 4.2 `AGENT_CORE_REPORT.md` — Conflict Markers Removed

Previous sessions had left unresolved git merge conflict markers inside the committed file.
This report replaces that broken content with a single resolved version.

---

## 5. Emission Flow — Verified Against Orchestrator

`src/orchestrator/orchestrator.service.ts` implements the canonical lifecycle:

```
Step 1  — initiation: StateRecording.capture('initiation', { amount })
Step 2  — admissibility: if not admissible -> terminate (no value, no emission)
Step 3  — node assignment: capture 'task_assignment'
Step 4  — execution: capture 'stage_transition', 'execution_complete'; nodes.recordExecution()
Step 5  — PoT verify: pot.verify() -> verdict.verified in {0, 1}; recorded in NodeChain + StateRecording
Step 6  — EMISSION (only if verified === 1):
            emission.emit(processId, amount)
              -> mint(amount): coin.recordMint(amount); chain.append('emission.minted')
              -> burn(minted):  coin.recordBurn(amount); chain.append('emission.burned')
            processNet += amount - amount = 0
Step 7  — fee accrual: commission.computeFee(amount) = amount x 0.005; commission.accrue(epoch, fee)
Step 8  — reserve index read (derived from NodeChain history, not mutated per-process)
Step 9  — final record: StateRecording.capture('final_status'); Eye.compareSupply()
```

The All-Seeing Eye observes passively at each step via `eye.log()` and `eye.compareSupply()`.
It never mutates state (I10).

---

## 6. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   <- MINT (1:1, PoT-gated; verified === 1 required)
Commission    = 10,000 x 0.005 = 50 ARO
  Node Share  = 50 x 0.75 = 37.50 ARO  -> coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 x 0.25 = 12.50 ARO  -> reserve.addAfcAccrual -> NodeChain (audit only)
Burn          = 10,000 ARO   <- BURN (net circulating change = 0)

After process completion:
  processMinted    = 10,000
  processBurned    = 10,000
  processNet       = 0              <- I5
  earnedRetained  += 37.50
  totalSupply      = (10,000 - 10,000) + 37.50 = 37.50 ARO   <- I6

reserveIndex = log10(1 + 10,000) = 4.0000
internalPrice = 1 x 4.0000 = 4.0000 ARO/unit
```

---

## 7. Model-A Remnants Check

| Prohibition | Found | Status |
|-------------|-------|--------|
| `staking` / `stakedBalance` / `stake_freeze` | No | Clean |
| `slashing` against balance or stake | No | Clean |
| Token-weighted governance | No | Clean |
| Farming / passive yield for holding | No | Clean |
| `mint-on-deposit` / `crypto_to_aroscoin` | No | Clean |
| All-Seeing Eye halting / voting / state-change | No | Clean |
| Emission outside confirmed-process logic | No | Clean |

---

## 8. Invariant Status

| ID | Invariant | Status |
|----|-----------|--------|
| I1 | Value exists only when PoT verified == 1 | Confirmed |
| I2 | Every emission bound to a confirmed process | Confirmed |
| I3 | Every significant event recorded in NodeChain | Confirmed |
| I4 | Deterministic execution: same input -> same result | Confirmed |
| I5 | Earned retained; process part burned; processNet -> 0 | Confirmed |
| I6 | `totalSupply` derivable = (minted-burned)+earnedRetained | Confirmed |
| I7 | Commission pool reconciles: sum(payments) + margin == sum(fees) | Confirmed |
| I8 | NodeChain append-only and hash-continuous | Confirmed |
| I9 | Node influence from work+reputation, not balance | Confirmed |
| I10 | All-Seeing Eye passive (observe -> log -> signal only) | Confirmed |

---

## 9. Files Changed

```
src/reserve/reserve.service.ts    totalAfcReserve() and addAfcAccrual() docstrings corrected:
                                  removed claim that AFC accruals drive the reserveIndex
                                  (spec I-RS-1: formula uses confirmed process volume only)

AGENT_CORE_REPORT.md              This report (conflict markers removed; content unified)
```

---

## 10. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| 2026-06-18 | `claude/inspiring-cannon-4m9xnj` | reserveIndex() formula aligned with spec; reference commission.ts constants corrected |
| **2026-06-19** | `agent/core-emission` | Method docstrings in ReserveService corrected; AGENT_CORE_REPORT.md conflict markers resolved |
