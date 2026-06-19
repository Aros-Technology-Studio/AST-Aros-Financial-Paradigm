# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `agent/core-emission`
**Date:** 2026-06-19 (updated; original 2026-06-18)
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; no executable code |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/commission.ts` | Reference implementation | **Corrected** |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Audited |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` does not exist. The production emission logic lives entirely in
`src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

The folders `01_coin_engine/` and `10_proof_of_transaction_engine/` are documentation
only, not deprecated modules. No executable content resides there.

---

## 2. Canonical Model (as verified against specs)

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
  reserveIndex   = log10(1 + totalProcessVolume)              ← spec formula, confirmed volume only
  internalPrice  = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals   → NodeChain (audit trail), not in index formula
```

Sources of authority (highest first): `docs/specs/AST_Reserve_AGENT_EN.md`,
`reference/ast-core/src/reserve.ts`. Both agree on the formula.

---

## 3. Production NestJS Code — Fully Conformant

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | `0.005` (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | `0.25` (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch | ✓ Correct (I7) |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` | ✓ Correct (I-RS-1) |

No changes were required in the production NestJS services.

---

## 4. Deviation Found and Corrected

### 4.1 Reference Commission Parameters

**File:** `reference/ast-core/src/commission.ts`

The reference implementation used different constants from the canonical model:

| Parameter | Was (diverged) | Now (canonical) |
|-----------|---------------|----------------|
| `feeRate` | `0.01` (1%) | `0.005` (0.5%) |
| `marginRate` | `0.2` (20% AFC / 80% nodes) | `0.25` (25% AFC / 75% nodes) |

The production NestJS `CommissionService` already had the correct canonical values.
The reference was updated to align so that `reference/ast-core/` and `src/` are
consistent on all parameters.

**Fix applied:** `reference/ast-core/src/commission.ts` lines 8–9:
```typescript
// Before
readonly feeRate = 0.01;
readonly marginRate = 0.2; // operational layer funding (7.4)

// After
readonly feeRate = 0.005;   // canonical 0.5 % per spec
readonly marginRate = 0.25; // canonical 25 % AFC share; remaining 75 % to nodes (7.4)
```

---

## 5. Emission Flow — Verified Against Orchestrator

`src/orchestrator/orchestrator.service.ts:99–196` implements the canonical lifecycle:

```
Step 1  — initiation: StateRecording.capture('initiation', { amount })
Step 2  — admissibility: if not admissible → terminate (no value, no emission)
Step 3  — node assignment: capture 'task_assignment'
Step 4  — execution: capture 'stage_transition', 'execution_complete'; nodes.recordExecution()
Step 5  — PoT verify: pot.verify() → verdict.verified ∈ {0, 1}; recorded in NodeChain + StateRecording
Step 6  — EMISSION (only if verified === 1):
            emission.emit(processId, amount)
              → mint(amount): coin.recordMint(amount); chain.append('emission.minted')
              → burn(minted):  coin.recordBurn(amount); chain.append('emission.burned')
            processNet += amount − amount = 0
Step 7  — fee accrual: commission.computeFee(amount) = amount × 0.005; commission.accrue(epoch, fee)
Step 8  — reserve index read (derived, not mutated per-process)
Step 9  — final record: StateRecording.capture('final_status'); Eye.compareSupply()
```

The All-Seeing Eye observes passively at each step via `eye.log()` and `eye.compareSupply()`.
It never mutates state (I10).

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
totalSupply after = 0 (process part burned) + earnedRetained (from node payments)
```

---

## 7. Model-A Remnants Check

Searched for prohibited constructs per `AST_RULES.yaml`:

| Prohibition | Found | Status |
|-------------|-------|--------|
| `staking` / `stakedBalance` / `stake_freeze` | No | Clean |
| `slashing` against balance or stake | No | Clean |
| Token-weighted governance / `vote-by-token-balance` | No | Clean |
| Farming / passive yield for holding | No | Clean |
| `mint-on-deposit` / `crypto_to_aroscoin` | No | Clean |
| All-Seeing Eye halting / voting / state-change | No | Clean (passive only) |
| Emission outside confirmed-process logic | No | Clean (PoT gate enforced) |

---

## 8. Invariant Status

| ID | Invariant | Status |
|----|-----------|--------|
| I1 | Value exists only when PoT verified == 1 | ✓ Confirmed |
| I2 | Every emission bound to a confirmed process | ✓ Confirmed |
| I3 | Every significant event recorded in NodeChain | ✓ Confirmed |
| I4 | Deterministic execution: same input → same result | ✓ Confirmed |
| I5 | Earned retained; process part burned; processNet → 0 | ✓ Confirmed |
| I6 | `totalSupply` derivable = (minted−burned)+earnedRetained | ✓ Confirmed |
| I7 | Commission pool reconciles: Σ(payments) + margin == Σ(fees) | ✓ Confirmed |
| I8 | NodeChain append-only and hash-continuous | ✓ Confirmed |
| I9 | Node influence from work+reputation, not balance | ✓ Confirmed |
| I10 | All-Seeing Eye passive (observe → log → signal only) | ✓ Confirmed |

---

## 9. Files Changed

**Run on branch `claude/inspiring-cannon-4m9xnj` (2026-06-18):**
```
<<<<<<< HEAD
reference/ast-core/src/commission.ts   feeRate: 0.01 → 0.005 (canonical 0.5%)
                                        marginRate: 0.2 → 0.25 (canonical 25% AFC share)
=======
src/reserve/reserve.service.ts    reserveIndex() formula corrected:
                                  log10(1 + totalProcessVolume + totalAfcReserve)
                                  → log10(1 + totalProcessVolume)   [spec I-RS-1/I-RS-2]
```

**Run on branch `agent/core-emission` (2026-06-19):**
```
src/reserve/reserve.service.ts    Class-level JSDoc corrected: formula comment still
                                  referenced `+ totalAfcReserve` even though the code
                                  was already fixed. Docstring now matches the spec and
                                  the implementation. AFC accrual role clarified as
                                  audit-trail-only (does not enter reserveIndex formula).
>>>>>>> 0962020 (feat: canonical 1:1 emission model implementation)

AGENT_CORE_REPORT.md                   This report
```

---

## 10. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
<<<<<<< HEAD
| PR #N-1 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec; reference commission.ts corrected (feeRate + marginRate) |
| **This run** | `agent/core-emission` | Re-audit (2026-06-19): confirmed all production logic correct; corrected class docstring in `reserve.service.ts` that had re-introduced the erroneous `+ totalAfcReserve` description |
=======
| PR prior | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec: removed `totalAfcReserve` from formula |
| **This run** | `agent/core-emission` | Class-level JSDoc in `reserve.service.ts` corrected to match spec formula; all 29 tests green |
>>>>>>> 0962020 (feat: canonical 1:1 emission model implementation)
