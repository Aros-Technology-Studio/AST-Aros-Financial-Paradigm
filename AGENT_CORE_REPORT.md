# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-5mxvwu`
**Date:** 2026-06-20
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or correct.

---

## 1. Directories and Files Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (`coin_emission_model.md`, `aro_emission_protocol.md`, etc.) | Historical Model-A docs; canon rates cross-checked |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical docs; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | **Audited ✓** |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService — unit ledger | **Audited ✓** |
| `src/commission/commission.service.ts` | NestJS CommissionService | **Audited ✓** |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Audited ✓** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | **Audited ✓** |
| `src/invariants/invariants.spec.ts` | I1–I10 automated acceptance tests | **Audited ✓** |
| `reference/ast-core/src/emission.ts` | Reference implementation (highest non-spec authority) | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` does not exist. The production emission logic lives in `src/emission/`,
`src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` is documentation only, not deprecated code. No executable content
resides there.

---

## 2. Canonical Model (as verified against specs and reference)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; processNet → 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              (spec formula; confirmed volume only)
  internalPrice  = base × reserveIndex                        (rises as confirmed work accumulates)
  AFC accruals   → NodeChain (audit trail), not in formula

Supply identity (I6):
  totalSupply = (processMinted − processBurned) + earnedRetained
```

---

## 3. Conformance Status — All Conformant

| Component | Canonical Requirement | Status |
|-----------|----------------------|--------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated, then burn | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` (I-EM-2) | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; processNet → 0 (I-EM-3) | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted−processBurned)+earnedRetained` (I-AC-5) | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`; 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | ✓ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — spec I-RS-1/I-RS-2 | ✓ Correct |
| AFC accrual in NodeChain | `reserve.afc.accrual` event recorded on epoch finalization | ✓ Correct |
| PoT gate | Binary verdict (`verified===1`); gates all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous (I8) | ✓ Correct |
| Nodes | Work+reputation weight; no stake/slashing fields (I9) | ✓ Correct |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations (I10) | ✓ Correct |
| Invariants I1–I10 | Automated acceptance tests in `src/invariants/invariants.spec.ts` | ✓ Present |

No code rewrites required. All components match the canonical model.

---

## 4. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75  = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25  = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit)
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

processNet = 0
totalSupply after completion = earnedRetained (I5/I6)

reserveIndex (after process): log10(1 + 10_000) ≈ 4.0000
internalPrice = base × 4.0000 → rises with each additional confirmed process
```

---

## 5. Note on Reference vs NestJS Commission Rates

The reference `commission.ts` uses `feeRate=0.01` (1%) and `marginRate=0.2` (20% margin,
80% to nodes). The NestJS implementation uses `feeRate=0.005` (0.5%) and `marginRate=0.25`
(25% AFC, 75% to nodes).

The Commission spec (`docs/specs/AST_Commission_AGENT_EN.md`) does not fix exact rate values —
it specifies `fee = tx.amount * feeRate` with configurable rates. The NestJS values follow
the canonical economics stated in `01_coin_engine/coin_emission_model.md` and
`aro_emission_protocol.md` (0.5% / 75% / 25%). The invariants that matter
(`poolReconcile: sum(payments) + margin = sum(fees)`, `verified===1` gate) hold for any
valid rate pair, and the automated tests (I7) enforce reconciliation independently of
the exact rate.

---

## 6. Invariant Impact

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Emission gate confirmed |
| I2 | Every emission bound to confirmed process | ✓ `mint()` throws without verdict |
| I3 | All significant events in NodeChain | ✓ All lifecycle events recorded |
| I4 | Deterministic: same input → same result | ✓ Sorted distribution, deterministic chain |
| I5 | Process part nets to 0 | ✓ `processMinted == processBurned` after completion |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Supply identity formula correct |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ `reconciled=true` in finalizeEpoch |
| I8 | NodeChain append-only | ✓ Hash-continuous reconstruction verified |
| I9 | Node influence from work+reputation | ✓ No stake/slashing fields |
| I10 | Eye passive: no state change | ✓ Eye never mutates state |
| I-EM-1/2/3 | Causality, PoT gate, cycle symmetry | ✓ |
| I-RS-1/2/4 | Grows from confirmed volume; derivable; monotonic | ✓ |
| I-CM-1/2/4 | Post-factum; PoT-confirmed only; pool reconciles | ✓ |

---

## 7. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned: removed `totalAfcReserve` from formula |
| **This run** | `claude/inspiring-cannon-5mxvwu` | Full re-audit; all components confirmed canonical; no changes to production code required |
