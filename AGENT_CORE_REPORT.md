# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-wdv1j3`
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
| `src/commission/commission.service.ts` | NestJS CommissionService | **Corrected** |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Corrected** |
| `src/commission/commission.module.ts` | Module wiring | **Corrected** |
| `src/commission/entities/epoch.entity.ts` | Epoch entity & DistributionEntry | **Comment updated** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Comment updated |
| `reference/ast-core/src/emission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/commission.ts` | Reference implementation | Audited |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

Module `01_coin_engine` is **NOT deprecated** — it is documentation. The production code lives
in `src/emission/` and related NestJS modules, which IS the current canonical implementation.

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

## 3. Conformant — No Changes Needed

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService.totalSupply()` | `(processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `ArosCoinService` three-tally ledger | Supply derived, never assigned | ✓ Correct |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct |
| NodeChain | Append-only, hash-continuous | ✓ Correct |
| Nodes service | Work+reputation weight; no stake/slashing fields | ✓ Correct |
| PoT | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct |

---

## 4. Deviations Found and Corrected

### 4.1 Commission Rate: 1% → 0.5%

**File:** `src/commission/commission.service.ts`

| | Before | After |
|--|--------|-------|
| `feeRate` | `0.01` (1%) | `0.005` (0.5%) |

**Reason:** Canonical emission protocol specifies the default fee rate as 0.5%.

---

### 4.2 Commission Split: 80/20 → 75/25

**File:** `src/commission/commission.service.ts`

| | Before | After |
|--|--------|-------|
| `marginRate` | `0.2` (20% margin) | `0.25` (25% AFC) |
| Distributable | `total × 0.80` → nodes | `total × 0.75` → nodes |
| Margin | `total × 0.20` → "AST" | `total × 0.25` → AFC Reserve |

**Reason:** Canonical split is 75% nodes / 25% AFC Reserve.

---

### 4.3 AFC Margin Routing: coin.recordEarned → reserve.addAfcAccrual

**Files:** `src/commission/commission.service.ts`, `src/reserve/reserve.service.ts`

| | Before | After |
|--|--------|-------|
| Margin destination | `coin.recordEarned(margin)` — inflated `totalSupply` | `reserve.addAfcAccrual(margin)` — NodeChain event `reserve.afc.accrual` |
| `MARGIN_RECIPIENT` label | `'AST'` | `'AFC_RESERVE'` |
| Distribution log reason | `'operational_margin'` | `'afc_reserve'` |

**Reason:** The Reserve spec (`docs/specs/AST_Reserve_AGENT_EN.md`) declares
`margin_from: Commission`. The 25% AFC share must feed the Reserve so the capitalization
index grows and raises the internal price. Crediting it to `coin.recordEarned` incorrectly
included the AFC portion in circulating `totalSupply`.

---

### 4.4 ReserveService — AFC Accrual Tracking (new capability)

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

---

### 4.5 CommissionModule — ReserveModule Import

**File:** `src/commission/commission.module.ts`

`ReserveModule` added to `imports[]` so `ReserveService` can be injected into
`CommissionService`. No circular dependency: `ReserveModule` depends only on `NodeChainModule`.

---

## 5. Invariant Impact After Changes

| ID | Rule | Impact |
|----|------|--------|
| I1 | Value only on verified === 1 | Unaffected — emission gate untouched |
| I2 | Every emission bound to confirmed process | Unaffected |
| I3 | All significant events in NodeChain | AFC accrual now also recorded → improved coverage |
| I4 | Deterministic: same input → same result | AFC accrual deterministic from fee × 0.25 |
| I5 | Process part nets to 0 | Unaffected — mint/burn symmetry untouched |
| I6 | `totalSupply = earnedRetained` after burns | Still holds: AFC in reserve (not earned); `totalSupply = (0) + earnedRetained` |
| I7 | Pool reconciles: `paid + margin == fees` | Still holds: `allocatedMargin = total − paid` ✓ |
| I8 | NodeChain append-only + hash-continuous | Unaffected |
| I9 | Node influence from work+reputation | Unaffected |
| I10 | Eye passive: no state change | Unaffected — `addAfcAccrual` called by Commission, not Eye |

---

## 6. Transaction Example: $10,000

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

## 7. Files Changed

```
src/commission/commission.service.ts      feeRate 0.01→0.005, marginRate 0.2→0.25,
                                          ReserveService injected, AFC routing corrected,
                                          labels and reasons updated

src/commission/commission.module.ts       ReserveModule added to imports

src/commission/entities/epoch.entity.ts   DistributionEntry comments updated

src/reserve/reserve.service.ts            addAfcAccrual(), totalAfcReserve(),
                                          reserveIndex() extended to include AFC

src/orchestrator/orchestrator.service.ts  Step-8 comment updated

AGENT_CORE_REPORT.md                      This report
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical implementation of 1:1 emission |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| **This run** | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
