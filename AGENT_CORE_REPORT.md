# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-7tjmhv`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; rates cross-checked |
| `10_proof_of_transaction_engine/` | PoT documentation (incl. pot_tx_incentive_distribution.md) | Corrected stale paths |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Comment corrected** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | **Definitive on formula** |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | **Definitive on formula** |

`src/token/` does not exist — there is no legacy `token/` module. The production
emission logic lives entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`,
and `src/reserve/`.

Module `01_coin_engine/` is documentation only, not deprecated code. No executable
content resides there.

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

## 3. Conformant — Code Verified Correct

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
| `ReserveService.reserveIndex()` implementation | `log10(1 + totalProcessVolume)` | ✓ Correct |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | ✓ Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |

---

## 4. Deviations Found and Corrected (this session)

### 4.1 ReserveService — Wrong Formula in Class-Level JSDoc

**File:** `src/reserve/reserve.service.ts`

The `reserveIndex()` method implementation was already correct (`log10(1 + totalProcessVolume)`),
but the class-level JSDoc retained the wrong formula from a previous draft.

**Spec authority:** `docs/specs/AST_Reserve_AGENT_EN.md`:
```yaml
formulas:
  reserveIndex: "reserveIndex = log10(1 + totalProcessVolume)"
```

**Reference authority:** `reference/ast-core/src/reserve.ts`:
```typescript
reserveIndex(): number { return log10(1 + this.totalProcessVolume); }
```

| | Before (deviated) | After (spec-correct) |
|--|------|------|
| Class JSDoc formula | `log10(1 + totalProcessVolume + totalAfcReserve)` | `log10(1 + totalProcessVolume)` (spec I-RS-1) |
| AFC input | Claimed to enter index computation | Correctly documented as NodeChain audit trail only |

**What stays unchanged:** `addAfcAccrual()` still records the AFC event in NodeChain
(correct per I3 — every significant event recorded). `totalAfcReserve()` still reads that
history for querying. The event routing from Commission is correct and untouched.

---

### 4.2 pot_tx_incentive_distribution.md — Stale Module Paths

**File:** `10_proof_of_transaction_engine/pot_tx_incentive_distribution.md`

The file referenced `src/token/emission.service.ts` and `src/fee_distribution/fee_distribution.service.ts`,
both of which are Model-A modules that were removed during the Model-1 rewrite.

| | Before (stale) | After (correct) |
|--|------|------|
| Implementation path | `src/token/emission.service.ts` | `src/commission/commission.service.ts` |
| Epoch distribution | `FeeDistributionService.distributeRewards()` | `CommissionService.finalizeEpoch()` |
| Spec reference | `01_coin_engine/payment_distribution.md` | `docs/specs/AST_Commission_AGENT_EN.md` |
| Reserve path | `src/fee_distribution/fee_distribution.service.ts` | `src/reserve/reserve.service.ts` |
| NodeChain event | `FEE_DISTRIBUTION` ledger entry | `commission.epoch.finalized` |

---

## 5. Invariant Impact After Changes

| ID | Rule | Impact |
|----|------|--------|
| I1 | Value only on verified === 1 | Unaffected — emission gate untouched |
| I2 | Every emission bound to confirmed process | Unaffected |
| I3 | All significant events in NodeChain | AFC accrual still recorded → compliant |
| I4 | Deterministic: same input → same result | `reserveIndex` still deterministic from NodeChain |
| I5 | Process part nets to 0 | Unaffected |
| I6 | `totalSupply` derivable | Unaffected — AFC not in coin ledger |
| I7 | Pool reconciles: `paid + margin == fees` | Unaffected |
| I8 | NodeChain append-only | Unaffected |
| I9 | Node influence from work+reputation | Unaffected |
| I10 | Eye passive: no state change | Unaffected |
| I-RS-1 | Grows only from confirmed volume | Comment now matches implementation |
| I-RS-2 | Derivable from NodeChain | Still holds — recomputed from history each call |
| I-RS-4 | Monotonic non-decreasing | Still holds — log(1 + volume) is monotonic |

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

## 7. Files Changed (this session)

```
src/reserve/reserve.service.ts
    Class-level JSDoc formula corrected:
      log10(1 + totalProcessVolume + totalAfcReserve)
      → log10(1 + totalProcessVolume)   [spec I-RS-1, comment only; implementation was already correct]

10_proof_of_transaction_engine/pot_tx_incentive_distribution.md
    Stale Model-A module paths replaced with current Model-1 paths:
      src/token/emission.service.ts → src/commission/commission.service.ts
      src/fee_distribution/ → src/reserve/reserve.service.ts
      01_coin_engine/payment_distribution.md → docs/specs/AST_Commission_AGENT_EN.md

AGENT_CORE_REPORT.md
    Updated to reflect this session's audit (branch claude/inspiring-cannon-7tjmhv)
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` implementation aligned with spec; class JSDoc not yet fixed |
| **This run** | `claude/inspiring-cannon-7tjmhv` | Class-level JSDoc formula corrected; stale paths in pot_tx_incentive_distribution.md fixed |
