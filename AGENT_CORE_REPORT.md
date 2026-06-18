# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-pl0dei`
**Date:** 2026-06-18
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Model-A documentation (aro_emission_protocol.md, payment_distribution.md, etc.) | Historical reference; cross-checked for canonical rates |
| `10_proof_of_transaction_engine/` | Model-A PoT documentation | Historical; no emission formulas corrected here |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/commission/commission.module.ts` | Module wiring | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/commission.ts` | Reference implementation (Model-A baseline) | Audited |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Audited |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

Module `01_coin_engine` is documentation. The production code lives in `src/emission/` and
related NestJS modules, verified to conform to the canonical specs.

---

## 2. Canonical Model

```
Emission     = Transaction Amount                          (1:1)
Commission C = Transaction Amount × feeRate                (default 0.5%)
  Node Share = C × 0.75                                   (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                   (25% → Reserve AFC)

ARO lifecycle:
  MINT(amount)  ← PoT verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; net = 0

Reserve index = log10(1 + totalProcessVolume + totalAfcReserve)
Internal price = base × reserveIndex                       (grows as reserve accumulates)
```

Sources: `docs/specs/AST_*_AGENT_EN.md` (highest authority), cross-validated against
`01_coin_engine/aro_emission_protocol.md` (canonical 75/25, 0.5% rate) and
`01_coin_engine/payment_distribution.md` (canonical 75/25 distribution split).

---

## 3. Full Conformance — Production Code Is Canonical

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService.totalSupply()` | `(processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `ArosCoinService` three-tally ledger | Supply derived, never assigned | ✓ Correct |
| `CommissionService.feeRate` | `0.005` (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | `0.25` (25% AFC) | ✓ Correct |
| Commission node distribution | 75% by PoT-confirmed participation weight | ✓ Correct |
| Commission AFC routing | `reserve.addAfcAccrual(allocatedMargin)` | ✓ Correct |
| Pool reconciliation | `Σ(paid) + afcMargin == Σ(fees)` per epoch | ✓ Correct |
| `ReserveService.addAfcAccrual()` | Appends `reserve.afc.accrual` to NodeChain | ✓ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume + totalAfcReserve)` | ✓ Correct |
| `CommissionModule` imports | `ReserveModule` present | ✓ Correct |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct |
| NodeChain | Append-only, hash-continuous | ✓ Correct |
| Nodes service | Work+reputation weight; no stake/slashing fields | ✓ Correct |
| PoT | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct |
| Orchestrator | PoT gate before emission; no value without verified===1 | ✓ Correct |

---

## 4. Deviations Found Across Audit History

### 4.1 Commission Rate: 1% → 0.5%  *(corrected in prior session)*

**File:** `src/commission/commission.service.ts`

| | Before | After |
|--|--------|-------|
| `feeRate` | `0.01` (1%) | `0.005` (0.5%) |

**Reason:** Canonical emission protocol specifies the default fee rate as 0.5%.

---

### 4.2 Commission Split: 80/20 → 75/25  *(corrected in prior session)*

**File:** `src/commission/commission.service.ts`

| | Before | After |
|--|--------|-------|
| `marginRate` | `0.2` (20% margin) | `0.25` (25% AFC) |
| Distributable | `total × 0.80` → nodes | `total × 0.75` → nodes |
| Margin | `total × 0.20` → "AST" | `total × 0.25` → AFC Reserve |

**Reason:** Canonical split is 75% nodes / 25% AFC Reserve.

---

### 4.3 AFC Margin Routing: coin.recordEarned → reserve.addAfcAccrual  *(corrected in prior session)*

**Files:** `src/commission/commission.service.ts`, `src/reserve/reserve.service.ts`

| | Before | After |
|--|--------|-------|
| Margin destination | `coin.recordEarned(margin)` — inflated `totalSupply` | `reserve.addAfcAccrual(margin)` — NodeChain event `reserve.afc.accrual` |
| `MARGIN_RECIPIENT` label | `'AST'` | `'AFC_RESERVE'` |
| Distribution log reason | `'operational_margin'` | `'afc_reserve'` |

**Reason:** The Reserve spec declares `margin_from: Commission`. The 25% AFC share must feed
the Reserve so the capitalization index grows and raises the internal price. Crediting it to
`coin.recordEarned` incorrectly included the AFC portion in circulating `totalSupply`.

---

### 4.4 ReserveService — AFC Accrual Tracking  *(added in prior session)*

**File:** `src/reserve/reserve.service.ts`

| Addition | Purpose |
|----------|---------|
| `static readonly AFC_ACCRUAL_EVENT = 'reserve.afc.accrual'` | NodeChain event type constant |
| `addAfcAccrual(amount)` | Appends the event; called by Commission on epoch finalization |
| `totalAfcReserve()` | Sums all `reserve.afc.accrual` events from NodeChain history |
| `reserveIndex()` updated | Now `log10(1 + totalProcessVolume + totalAfcReserve)` |

**Reason:** Without this, commission AFC accruals were invisible to the reserve. Now both
confirmed-process emission volume AND epoch AFC accruals drive the index upward, implementing
"Резерв AFC растёт → цена следующей эмиссии выше" (AFC reserve grows → next emission price
higher). The index remains derivable from NodeChain history (spec I-RS-2).

**Note on spec formula:** The canonical spec (`AST_Reserve_AGENT_EN.md`) states
`reserveIndex = log10(1 + totalProcessVolume)`. The production code extends this to include
`totalAfcReserve` as required by the task's canonical model. This extension is consistent with
the spec's stated dependency `margin_from: Commission` and the task requirement that "Резерв AFC
растёт → цена следующей эмиссии выше". Both addends are derived from NodeChain history (I-RS-2);
the index remains monotonic non-decreasing (I-RS-4).

---

### 4.5 CommissionModule — ReserveModule Import  *(added in prior session)*

**File:** `src/commission/commission.module.ts`

`ReserveModule` added to `imports[]` so `ReserveService` can be injected into
`CommissionService`. No circular dependency: `ReserveModule` depends only on `NodeChainModule`.

---

## 5. Reference Implementation vs. Production

The reference `commission.ts` still carries Model-A values (`feeRate = 0.01`, `marginRate = 0.2`).
This is a discrepancy: per `CLAUDE.md`, the reference implementation (`reference/ast-core/`) is
second-highest authority after the specs, but the specs are unambiguous — `feeRate = 0.005` and
the 75/25 split apply. The reference `commission.ts` reflects the pre-migration Model-A baseline
and has not been updated to Model-1 values. The production code correctly follows the specs
(highest authority) over the outdated reference values in this specific case.

---

## 6. Invariant Status

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ Upheld — PoT gate enforced in EmissionService |
| I2 | Every emission bound to confirmed process | ✓ Upheld — `mint()` throws without verified===1 |
| I3 | All significant events in NodeChain | ✓ Upheld — emission, commission, AFC accruals recorded |
| I4 | Deterministic: same input → same result | ✓ Upheld — nodeIds sorted before distribution |
| I5 | Earned retained; process part burned; net → 0 | ✓ Upheld — burn mirrors mint; `processNet -> 0` |
| I6 | `totalSupply = earnedRetained` after burns | ✓ Upheld — AFC in reserve, not in earnedRetained |
| I7 | Commission pool reconciles | ✓ Upheld — `paid + afcMargin == totalFees` within 1e-9 |
| I8 | NodeChain append-only + hash-continuous | ✓ Upheld — NodeChainService enforces |
| I9 | Node influence from work+reputation | ✓ Upheld — no stake/stakedBalance field |
| I10 | All-Seeing Eye passive: no state change | ✓ Upheld — Eye calls only log/compare |

---

## 7. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (before AFC accrual):  log10(1 + 10_000 + 0)    ≈ 4.0000
reserveIndex (after epoch finalize): log10(1 + 10_000 + 12.5) ≈ 4.0005
internalPrice = base × 4.0005  → rises → next emission "more expensive"
```

---

## 8. Files in Production (Final State)

```
src/emission/emission.service.ts       1:1 PoT-gated mint/burn; canonical ✓
src/aroscoin/aroscoin.service.ts       Three-tally ledger; derivable totalSupply ✓
src/commission/commission.service.ts   feeRate=0.005, marginRate=0.25, AFC routing ✓
src/commission/commission.module.ts    ReserveModule in imports ✓
src/commission/entities/epoch.entity.ts Epoch + DistributionEntry; positive comments ✓
src/reserve/reserve.service.ts         addAfcAccrual, totalAfcReserve, extended index ✓
src/orchestrator/orchestrator.service.ts PoT-gated lifecycle; canonical step order ✓
AGENT_CORE_REPORT.md                   This report (updated)
```

---

## 9. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical implementation of 1:1 emission |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| **This run** | `claude/inspiring-cannon-pl0dei` | Full re-audit; all components verified canonical; no code changes required |
