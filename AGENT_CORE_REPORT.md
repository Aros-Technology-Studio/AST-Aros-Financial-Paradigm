# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-qngkrq`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical model; verify or correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; non-authoritative |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no executable content |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` does not exist. The `01_coin_engine/coin_emission_model.md` references it as the
canonical implementation path — this confirms that document is historical Model-A. All
production emission logic lives in `src/emission/`, `src/aroscoin/`, `src/commission/`,
and `src/reserve/`.

---

## 2. Canonical Model (authoritative per specs + task)

```
Emission     = Transaction Amount                              (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                    (feeRate = 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, NodeChain event)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1 required
  … process executes …
  BURN(amount)  ← cycle completion; net contribution = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              ← spec I-RS-2, I-RS-4
  internalPrice  = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals   → NodeChain (full audit trail), excluded from formula per I-RS-1
```

### Example: transaction amount = 10,000 ARO

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO     ← MINT (1:1, PoT-gated)
Commission     = 10,000 × 0.005 = 50 ARO
  Node Share   = 50 × 0.75  = 37.50 ARO  (post-factum at epoch finalization, by PoT weight)
  AFC Reserve  = 50 × 0.25  = 12.50 ARO  (NodeChain event: reserve.afc.accrual)
Burn           = 10,000 ARO     ← BURN; net circulating change = 0

reserveIndex (after this process):  log10(1 + 10_000) ≈ 4.000
internalPrice = base × 4.000       → rises with each confirmed process (I-RS-4)
```

---

## 3. Audit Result — All Components Compliant

| Component | Canonical Requirement | Code Location | Verdict |
|-----------|----------------------|---------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | `src/emission/emission.service.ts:55` | ✓ |
| `EmissionService.mint()` | Throws if `verified !== 1` (I2) | `src/emission/emission.service.ts:71` | ✓ |
| `EmissionService.burn()` | Burns minted amount; process net → 0 (I5) | `src/emission/emission.service.ts:85` | ✓ |
| `ArosCoinService` ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` (I6) | `src/aroscoin/aroscoin.service.ts:86` | ✓ |
| `CommissionService.feeRate` | 0.005 (0.5%) | `src/commission/commission.service.ts:69` | ✓ |
| `CommissionService.marginRate` | 0.25 (25% → AFC reserve) | `src/commission/commission.service.ts:72` | ✓ |
| Commission 75/25 distribution | `distributable = totalFees * 0.75`; remainder → `reserve.addAfcAccrual` | `src/commission/commission.service.ts:137` | ✓ |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | `src/commission/commission.service.ts:172` | ✓ |
| PoT gate | `verified === 1` required before any value creation (I1/I2/P7) | `src/emission/emission.service.ts:57` | ✓ |
| PoT idempotency | Verdict issued once per process (I-PoT-4) | `src/pot/pot.service.ts:63` | ✓ |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` only (I-RS-1/I-RS-2) | `src/reserve/reserve.service.ts:92` | ✓ |
| AFC accrual recording | NodeChain event `reserve.afc.accrual` on epoch finalization | `src/reserve/reserve.service.ts:81` | ✓ |
| NodeChain append-only | Hash-continuous chain; reconstruct().ok == true (I8) | `src/nodechain/nodechain.service.ts` | ✓ |
| Nodes weight model | Work + reputation weight; no stake, no slashing fields (I9) | `src/nodes/nodes.service.ts` | ✓ |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations (I10) | `src/all-seeing-eye/all-seeing-eye.service.ts` | ✓ |
| Orchestrator lifecycle | `initiation → admissibility → node assignment → execution → PoT → emission → fee → reserve` | `src/orchestrator/orchestrator.service.ts` | ✓ |

---

## 4. Deviation History

### 4.1 ReserveService — `reserveIndex()` Formula (Corrected in PR #306)

**Previous state (deviated):** `log10(1 + totalProcessVolume + totalAfcReserve)`

**Corrected state:** `log10(1 + totalProcessVolume)` per spec `AST_Reserve_AGENT_EN.md`:
```yaml
formulas:
  reserveIndex: "reserveIndex = log10(1 + totalProcessVolume)"
```
and reference `reference/ast-core/src/reserve.ts`:
```typescript
reserveIndex(): number { return log10(1 + this.totalProcessVolume); }
```

**Root cause (resolved):** A previous agent added `totalAfcReserve` to implement
"AFC Reserve → price rises". Correct in intent but wrong in mechanism: I-RS-1 restricts
growth to confirmed-work volume only. AFC accruals are a derivative of commission, not
direct confirmed process volume. The price does still rise with each confirmed process
because `totalProcessVolume` grows with every `emission.minted` event — the intent is
preserved through the correct path.

**AFC recording unchanged:** `addAfcAccrual()` still appends `reserve.afc.accrual` to
NodeChain. `totalAfcReserve()` still reads that history for querying and audit. Only the
formula for `reserveIndex()` was corrected.

---

## 5. Reference vs NestJS — Known Divergence

| Parameter | Reference (`reference/ast-core/`) | NestJS (`src/commission/`) | Canonical (task/spec) |
|-----------|----------------------------------|---------------------------|-----------------------|
| `feeRate` | 0.01 (1%) | 0.005 (0.5%) | 0.5% ✓ |
| `marginRate` | 0.2 (80/20) | 0.25 (75/25) | 75/25 ✓ |

The reference carries placeholder values from an earlier development pass. The task
description and `01_coin_engine/coin_emission_model.md` both specify 0.5% and 75/25 as the
canonical parameters. The agent specs (`AST_Commission_AGENT_EN.md`) do not bind specific
numeric values — only the formula structure. The NestJS values are correct.

---

## 6. Invariant Coverage

| ID | Rule | Test Location | Status |
|----|------|---------------|--------|
| I1 | Value only when PoT verified === 1 | `src/invariants/invariants.spec.ts` + `emission.service.spec.ts` | ✓ Tested |
| I2 | Every emission bound to confirmed process | `emission.service.spec.ts:111` | ✓ Tested |
| I3 | Every significant event in NodeChain | `orchestrator.service.spec.ts` | ✓ Tested |
| I4 | Deterministic: same input → same result | `orchestrator.service.spec.ts` + `invariants.spec.ts` | ✓ Tested |
| I5 | Earned retained; process part burned; processNet → 0 | `emission.service.spec.ts:74` | ✓ Tested |
| I6 | `totalSupply = earnedRetained` after burns | `emission.service.spec.ts:84` | ✓ Tested |
| I7 | Commission pool reconciles per epoch | `commission.service.spec.ts` | ✓ Tested |
| I8 | NodeChain append-only and hash-continuous | `orchestrator.service.spec.ts` | ✓ Tested |
| I9 | Node influence from work+reputation, not balance | `src/nodes/` (no stake field) | ✓ Grep-clean |
| I10 | All-Seeing Eye passive: signals only | `orchestrator.service.spec.ts` + `invariants.spec.ts` | ✓ Tested |

---

## 7. Prohibitions Check

| ID | Prohibition | Status |
|----|-------------|--------|
| P1 | staking / stakedBalance / stake_freeze | ✓ Absent |
| P2 | slashing against balance or stake | ✓ Absent |
| P3 | token-weighted governance | ✓ Absent |
| P4 | farming / passive yield for holding | ✓ Absent |
| P5 | mint-on-deposit / crypto_to_aroscoin conversion | ✓ Absent |
| P6 | All-Seeing Eye halting/reverting/enforcing | ✓ Absent |
| P7 | emission outside confirmed-process logic | ✓ Absent |
| P8 | entities defined by negation in comments | ✓ Absent |

---

## 8. Files Status

```
src/emission/emission.service.ts        COMPLIANT — no changes needed
src/aroscoin/aroscoin.service.ts        COMPLIANT — no changes needed
src/commission/commission.service.ts    COMPLIANT — no changes needed
src/reserve/reserve.service.ts          COMPLIANT — formula correct (corrected in PR #306)
src/orchestrator/orchestrator.service.ts  COMPLIANT — full lifecycle wired correctly
```

---

## 9. Audit Trail

| Session | Branch / PR | Action |
|---------|-------------|--------|
| Historical | `agent/core-emission` / PR #72 | First canonical 1:1 emission implementation |
| Migration | `claude/ast-model1-rewrite` / PR #289 | Full NestJS Model-1 rewrite (all 11 modules) |
| CI hardening | `claude/inspiring-cannon-9niouj` / PR #296 | Invariants + CI; code confirmed canonical |
| Commission fix | `claude/inspiring-cannon-wdv1j3` / PR #298 | Commission 75/25 + AFC reserve routing corrected |
| Reserve formula | `claude/inspiring-cannon-4m9xnj` / PR #306 | `reserveIndex()` corrected: removed `totalAfcReserve` from formula |
| **This run** | `claude/inspiring-cannon-qngkrq` | Fresh full-stack audit: all canonical model requirements confirmed compliant; no code changes required |
