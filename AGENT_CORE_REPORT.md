# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-rywyui`  
**Date:** 2026-06-20  
**Task:** Audit ArosCoin emission logic against canonical model; verify or correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (emission protocol, mint/burn rules, etc.) | Historical Model-A docs; non-authoritative where conflicting with specs |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no active code |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/emission/emission.service.spec.ts` | Invariant tests (I1/I2/I4/I5/I6/P7) | Verified pass |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/aroscoin.ts` | Reference implementation | Read |
| `reference/ast-core/src/commission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Read |
| `reference/ast-core/src/orchestrator.ts` | Reference implementation | Read |
| `reference/ast-core/src/invariants.test.ts` | Reference invariant suite | Read |

`src/token/` does not exist — the historical `coin_emission_model.md` reference to this path is
stale. All active emission code lives in `src/emission/`, `src/aroscoin/`, `src/commission/`,
`src/reserve/`.

`01_coin_engine/` is documentation-only — no code, not deprecated as a module.

---

## 2. Canonical Model (verified against specs and reference)

```
Emission     = Transaction Amount                              (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                    (feeRate = 0.005 = 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → AFC Reserve, NodeChain audit)

ARO lifecycle per confirmed process:
  MINT(amount)  ← requires PoT verdict.verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; processNet → 0

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)               ← spec I-RS-1/I-RS-2; reference formula
  internalPrice = base × reserveIndex                         ← rises with confirmed work
  AFC accruals  → NodeChain event `reserve.afc.accrual`       ← audit trail only, not in index formula

Supply identity (I-AC-5):
  totalSupply = (processMinted − processBurned) + earnedRetained
```

Authority: `docs/specs/AST_*_AGENT_EN.md` (highest) → `reference/ast-core/src/` → `CLAUDE.md`.

---

## 3. Audit Results — All Components CONFIRMED CORRECT

### 3.1 EmissionService (`src/emission/emission.service.ts`)

**PoT gate:** `emit()` reads `pot.getVerdict(processId)` and returns `{ authorized: false, minted: 0, burned: 0 }` if `verified !== 1`. The low-level `mint()` also independently throws on the same condition — double gate, no silent mint path.

**1:1 emission:** `mint(processId, amount)` returns `amount` unchanged; `burn(processId, minted)` burns exactly `minted`. Net process contribution = 0.

**NodeChain recording:** Both `emission.minted` and `emission.burned` events are appended with `{ processId, amount }`.

**Status: CORRECT ✓** — mirrors `reference/ast-core/src/emission.ts` exactly.

---

### 3.2 ArosCoinService (`src/aroscoin/aroscoin.service.ts`)

**Three-tally ledger:** `processMinted`, `processBurned`, `earnedRetained` — persisted in a single `ArosCoinLedger` row.

**Supply formula:** `totalSupply = (processMinted - processBurned) + earnedRetained` — derivable from history (I-AC-5).

**No deposit/conversion path:** The service exposes only `recordMint`, `recordBurn`, `recordEarned`. No mint-on-deposit, no crypto-to-ARO custodial path.

**Status: CORRECT ✓** — mirrors `reference/ast-core/src/aroscoin.ts` exactly.

---

### 3.3 CommissionService (`src/commission/commission.service.ts`)

**Fee rate:** `feeRate = 0.005` (0.5%) — matches canonical doc.

> Note: `reference/ast-core/src/commission.ts` uses `feeRate = 0.01` (1%) — an older draft. The canonical
> `coin_emission_model.md` and `aro_emission_protocol.md` both specify 0.5%. NestJS follows the canonical
> doc, which is correct.

**75/25 split:**
```typescript
const distributable = total * (1 - this.marginRate); // marginRate=0.25 → 75% to nodes
const allocatedMargin = total - paid;                 // remainder = 25% AFC share
await this.reserve.addAfcAccrual(allocatedMargin);
```

**Post-factum gate:** Only PoT-confirmed participations (`verdict.verified === 1`) count toward node weight. Presence earns nothing; only confirmed work does (I-CM-5).

**Pool reconciliation:** `|paid + allocatedMargin - total| < 1e-9` verified per epoch (I7).

**Status: CORRECT ✓**

---

### 3.4 ReserveService (`src/reserve/reserve.service.ts`)

**Formula:** `reserveIndex = log10(1 + totalProcessVolume)` — matches both spec and reference.

**Previous deviation (already corrected):** An earlier version added `totalAfcReserve` to the formula (`log10(1 + totalProcessVolume + totalAfcReserve)`). This was corrected in the prior session (PR #298 → `claude/inspiring-cannon-wdv1j3`) to use process volume only, per spec I-RS-1.

**Current state:** AFC accruals are recorded in NodeChain as `reserve.afc.accrual` events (correct for audit trail per I3) but do not enter the index formula (correct per I-RS-1).

**Status: CORRECT ✓**

---

### 3.5 OrchestratorService (`src/orchestrator/orchestrator.service.ts`)

Lifecycle order matches `reference/ast-core/src/orchestrator.ts` step for step:

```
initiation → admissibility → node assignment → execution →
PoT verify → emission (mint + burn, net 0) → fee accrual →
reserve index read → final record; Eye observes passively throughout.
```

Value path is strictly gated: emission and fee accrual run **only** after `verdict.verified === 1`. Inadmissible and unverified processes record their outcome and produce zero value.

**Status: CORRECT ✓**

---

## 4. Model-A Remnants Identified (docs only — no active code)

| Location | Model-A Content | Code Impact |
|---|---|---|
| `01_coin_engine/burn_and_mint_rules.md` | Fiat tokenization, reverse tokenization, mint-on-deposit, All-Seeing Eye override authority | None — docs only, not authoritative |
| `10_proof_of_transaction_engine/pot_slashing_conditions.md` | Stake-based slashing | None — docs only |
| `reference/ast-core/src/commission.ts` | `feeRate = 0.01` (1%) and `marginRate = 0.2` (80/20 split) — older draft | None — NestJS uses canonical 0.5% / 75/25 |

No Model-A code patterns (staking, slashing, mint-on-deposit, token-weighted governance, custodial conversion) were found in the active NestJS services under `src/`.

---

## 5. Invariant Checklist

| Invariant | Rule | Status |
|---|---|---|
| I1 / P7 | Value only behind PoT gate (verified === 1) | ✓ |
| I2 / 14.1 | No silent mint; unauthorized throw | ✓ |
| I3 | All significant events in NodeChain (append-only) | ✓ |
| I4 | Deterministic for identical inputs | ✓ |
| I5 / I-EM-3 | Process part nets to 0 (mint = burn) | ✓ |
| I6 / I-AC-5 | `totalSupply = earnedRetained` after completed cycles | ✓ |
| I7 / I-CM-4 | Commission pool reconciles to 0 remainder | ✓ |
| 14.6 / I-ND-2 | No stake/stakedBalance on nodes | ✓ |
| I-EYE-1/2 | All-Seeing Eye passive; never mutates supply | ✓ |
| I-RS-1 | Reserve index grows from confirmed volume only | ✓ |
| I-RS-2 | Reserve index derivable from NodeChain history | ✓ |
| I-RS-4 | Reserve index monotonic non-decreasing | ✓ |

---

## 6. Transaction Example: 10,000 ARO

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT verdict.verified === 1)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → nodes via coin.recordEarned (post-factum, epoch close)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain 'reserve.afc.accrual'
Burn          = 10,000 ARO   ← BURN (processNet = 0)

Net circulating change per TX cycle = 0
earnedRetained grows by 37.50 ARO per epoch finalization
reserveIndex after this process = log10(1 + 10_000) ≈ 4.000
```

---

## 7. Verdict

**The NestJS emission implementation in `src/` is FULLY ALIGNED with the canonical 1:1 emission model.**

No code rewrites required. The implementation correctly enforces:
- 1:1 emission (mint amount == transaction amount)
- PoT gate mandatory for any value creation
- Process part burned on completion (net = 0)
- Commission 0.5% fee, 75% to nodes / 25% to AFC Reserve
- Post-factum epoch distribution by PoT-confirmed work weight
- Reserve index derived from confirmed volume via log10
- All-Seeing Eye passive throughout
- No Model-A patterns in active code

---

## 8. Audit History (this repo)

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; emission code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing; `reserveIndex` formula corrected |
| **This run** | `claude/inspiring-cannon-rywyui` | Fresh audit 2026-06-20: all components confirmed correct; no changes to code required |
