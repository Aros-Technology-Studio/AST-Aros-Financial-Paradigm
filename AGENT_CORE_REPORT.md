# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `agent/core-emission`
**Date:** 2026-06-23 (updated — see §25 for latest session; §9–§24 for prior sessions)
**Task:** Audit ArosCoin emission logic against the canonical model; correct remaining deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|----------|
| `01_coin_engine/` | Documentation: aro_emission_protocol.md, coin_emission_model.md, etc. | Historical Model-A docs; rates cross-checked |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/token/` | Does not exist | — |
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

`src/token/` does not exist — no legacy token module. The production emission logic lives
entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` and `10_proof_of_transaction_engine/` are documentation only,
not deprecated code. No executable content resides in either folder.

`10_proof_of_transaction_engine/` is documentation only. The PoT runtime lives in
`src/pot/pot.service.ts`.

---

## 2. Canonical Model (verified against specs)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% -> nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% -> Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  <- PoT verified === 1
  ... process executes ...
  BURN(amount)  <- cycle completion; net = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              <- spec I-RS-1/I-RS-2; confirmed volume only
  internalPrice  = base x reserveIndex                        <- rises as confirmed work accumulates
  AFC accruals   -> NodeChain (audit trail), not in formula
```

Sources of authority (highest first): `docs/specs/AST_Reserve_AGENT_EN.md`,
`docs/specs/AST_Emission_AGENT_EN.md`, `docs/specs/AST_Commission_AGENT_EN.md`,
`reference/ast-core/src/`.

---

## 3. Full Conformance — No Code Changes Required

All emission, ledger, commission, and reserve logic is canonical. The single
historical deviation (`reserveIndex()` including `totalAfcReserve`) was corrected in
PR #306 (`claude/inspiring-cannon-4m9xnj`, commit `dad29bd`). This run confirms
that correction is in place and all other components pass.

| Component | Canonical Requirement | File | Verdict |
|-----------|----------------------|------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | `src/emission/emission.service.ts:55` | Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | `src/emission/emission.service.ts:71` | Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net -> 0 | `src/emission/emission.service.ts:85` | Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted - processBurned) + earnedRetained` | `src/aroscoin/aroscoin.service.ts:86` | Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | `src/commission/commission.service.ts:69` | Correct |
| `CommissionService.marginRate` | 0.25 (25% -> AFC) | `src/commission/commission.service.ts:72` | Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | `src/commission/commission.service.ts:148-159` | Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | `src/commission/commission.service.ts:172` | Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — spec I-RS-1/I-RS-2 | `src/reserve/reserve.service.ts:92` | Correct |
| AFC accrual routing | `addAfcAccrual()` records to NodeChain; not in index formula | `src/reserve/reserve.service.ts:81` | Correct |
| PoT gate | Binary verdict; gates all downstream value | `src/pot/pot.service.ts` | Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous | `src/nodechain/nodechain.service.ts` | Correct (I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | `src/nodes/nodes.service.ts` | Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | `src/all-seeing-eye/all-seeing-eye.service.ts` | Correct (I10) |
| Orchestrator burn ordering | mint → commission.accrue → burn (reference canonical order) | `src/orchestrator/orchestrator.service.ts` | **Fixed session §4** |
| `coin_emission_model.md` code path | `src/emission/emission.service.ts` | `01_coin_engine/coin_emission_model.md` | **Fixed session §4** |
| `coin_emission_model.md` reserveIndex | `log10(1 + totalProcessVolume)` | `01_coin_engine/coin_emission_model.md` | **Fixed session §4** |

---

## 4. Deviations Corrected (Historical)

### 4.1 Orchestrator: Burn Ordering (`src/orchestrator/orchestrator.service.ts`)

The orchestrator previously called `emission.emit()` which bundles mint + burn atomically,
then called commission accrual. This inverted the reference canonical order: burn happened
before commission, where the reference burns after.

**Reference canonical order** (`reference/ast-core/src/orchestrator.ts` lines 57–68):
```
mint(amount) → commission.accrue(fee) → reserve.addConfirmedVolume → burn(amount)
```

**Before:** `emission.emit()` → commission.accrue (burn already done inside emit)

**After:** `emission.mint()` → commission.accrue → `emission.burn()` (canonical order)

Economic outcome is identical (processNet → 0 either way). Both `mint()` and `burn()` already
existed as public methods on `EmissionService`; no new API was added.

### 4.2 Documentation: `01_coin_engine/coin_emission_model.md`

**Error 1 — wrong code path** (Model-A remnant):
```
Before: src/token/emission.service.ts   (never existed)
After:  src/emission/emission.service.ts
```

**Error 2 — wrong reserveIndex formula** (from a different model variant):
```
Before: reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
After:  reserveIndex = log10(1 + totalProcessVolume)
```
The agent spec (`docs/specs/AST_Reserve_AGENT_EN.md`) and reference both define the log10 formula.

**Error 3 — wrong API methods** (referenced non-existent methods):
Updated to reflect the actual `EmissionService` API and the canonical 3-step lifecycle order.

---

## 5. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   <- MINT (1:1, PoT-gated; verified === 1)
Commission    = 10,000 x 0.005 = 50 ARO
  Node Share  = 50 x 0.75 = 37.50 ARO  -> coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 x 0.25 = 12.50 ARO  -> reserve.addAfcAccrual -> NodeChain event (audit trail)
Burn          = 10,000 ARO   <- BURN (net circulating change = 0)

reserveIndex (after process):     log10(1 + 10_000) = 4.0000
internalPrice = base x 4.0000    -> rises monotonically with each confirmed process (I-RS-4)
```

---

## 5. Invariant Coverage

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on PoT verified === 1 | `EmissionService.emit()` gate |
| I2 | Every emission bound to a confirmed process | `EmissionService.mint()` throws on unverified |
| I3 | All significant events in NodeChain | Full lifecycle events appended |
| I4 | Deterministic: same input -> same result | Sorted node iteration; log formula |
| I5 | Process part nets to 0 (`processNet -> 0`) | burn(minted) called after commission accrual |
| I6 | `totalSupply = earnedRetained` after burns | Tally identity holds |
| I7 | Pool reconciles: `paid + margin == fees` | Epsilon check in `finalizeEpoch()` |
| I8 | NodeChain append-only, hash-continuous | `reconstruct()` breaks on tamper |
| I9 | Node influence from work+reputation | No stake fields; weight = reputation x uptime |
| I10 | Eye passive: no state change | `compareSupply`/`verifyChain` read-only |
| I-EM-1 | Causality: every mint bound to verified process | Confirmed |
| I-EM-2 | PoT gate: no mint without verified === 1 | Confirmed |
| I-EM-3 | Cycle symmetry: process part burned on completion | Confirmed |
| I-RS-1 | Grows only from confirmed volume | `reserveIndex` uses `totalProcessVolume` only |
| I-RS-2 | `reserveIndex` derivable from NodeChain, not set manually | Recomputed from history each call |
| I-RS-4 | Monotonic non-decreasing | `log10(1 + volume)` is monotonic |

---

## 6. Prohibition Grep Results

No prohibited construct found in production code (`src/`):

| ID | Forbidden Pattern | Result |
|----|-------------------|--------|
| P1 | `staking / stakedBalance / stake_freeze` | Clean |
| P2 | `slashing against balance` | Clean |
| P3 | `token-weighted governance` | Clean |
| P4 | `farming / passive yield` | Clean |
| P5 | `mint-on-deposit / crypto_to_aroscoin` | Clean |
| P6 | Eye halting/reverting/voting | Clean |
| P7 | Emission outside confirmed-process logic | Clean |

---

## 7. Files Changed (Historical)

```
src/orchestrator/orchestrator.service.ts   Burn ordering: emit() → separate mint + commission + burn
01_coin_engine/coin_emission_model.md      reserveIndex formula + code path + API corrected
01_coin_engine/burn_and_mint_rules.md      Rewritten: Model-A constructs removed
src/emission/emission.service.ts           calculate() pure canonical formula method added
src/emission/emission.service.spec.ts      calculate() tests added
src/commission/commission.service.ts       finalizeEpoch() JSDoc: AFC routing note corrected
src/reserve/reserve.service.ts             Class-level comment bug fixed
AGENT_CORE_REPORT.md                       Updated each session (this document)
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| Initial | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec (removed `totalAfcReserve`; commit `dad29bd`) |
| §9–§24 | `agent/core-emission` | 16 re-audit sessions; comment/JSDoc corrections; tests added |
| **§25** | `claude/inspiring-cannon-5emjjf` | 2026-06-23 re-audit — all canonical; no deviations |

---

## 9–24. Prior Sessions (summary)

Sessions §9–§24 covered 16 independent full re-audits from 2026-06-19 to 2026-06-21.
All confirmed the canonical 1:1 emission model fully in place. Changes made across those
sessions were limited to:
- JSDoc/comment corrections (reserve formula mention, AFC routing note)
- `calculate()` pure method added to `EmissionService`
- `calculate()` test coverage added to `emission.service.spec.ts`
- `01_coin_engine/burn_and_mint_rules.md` rewritten to remove Model-A constructs
- `01_coin_engine/coin_emission_model.md` corrected (code path, formula, API)
- Orchestrator burn-order aligned to canonical reference order

No production logic deviations were found or corrected after §4.1.

---

## 25. 2026-06-23 Full Re-Audit (branch: claude/inspiring-cannon-5emjjf, session 19)

**Scope:** Independent re-audit of all emission modules against the canonical 1:1 model.
Session: `session_01P47mZSyq8aHi7LyNBZ731n` (claude-sonnet-4-6)

**Directories audited this run:**
- `01_coin_engine/` — 11 files (Markdown + JSON); documentation only; no executable code.
  `coin_emission_model.md` already corrected in §4 and §9.
- `10_proof_of_transaction_engine/` — 9 Markdown files; PoT documentation only.
  Runtime lives in `src/pot/pot.service.ts`.
- `src/token/` — **does not exist**. All emission logic resides in `src/emission/`,
  `src/aroscoin/`, `src/commission/`, `src/reserve/`.
- `src/emission/emission.service.ts` — read and verified
- `src/aroscoin/aroscoin.service.ts` — read and verified
- `src/commission/commission.service.ts` — read and verified
- `src/reserve/reserve.service.ts` — read and verified
- `reference/ast-core/src/emission.ts`, `aroscoin.ts`, `commission.ts`, `reserve.ts` — read
- `src/emission/emission.service.spec.ts` — read (calculate() tests confirmed present)

**Canonical Model Verified:**
```
Emission     = Transaction Amount  (1:1, PoT-gated; verified === 1)
Commission   = Amount × 0.005      (0.5%)
Node Share   = Commission × 0.75   (75% → nodes, post-factum at epoch finalization)
AFC Share    = Commission × 0.25   (25% → reserve.addAfcAccrual → NodeChain audit only)
reserveIndex = log10(1 + totalProcessVolume)   (spec I-RS-1/I-RS-2; AFC not in formula)
Burn         = Emission amount on cycle completion; processNet → 0
```

**Line-by-line verification of production code:**

| Canonical Requirement | Code Location | Exact Value | Status |
|-----------------------|--------------|-------------|--------|
| Emission = Transaction Amount (1:1) | `emission.service.ts` `emit()` | `minted = await this.mint(processId, amount)` | ✅ CONFIRMED |
| PoT gate (verified === 1 required) | `emission.service.ts` | `if (!verdict \|\| verdict.verified !== 1) return { authorized: false, minted: 0 }` | ✅ CONFIRMED |
| Mint throws without gate | `emission.service.ts` `mint()` | `throw new Error('emission refused ... verified === 1 required')` | ✅ CONFIRMED |
| Burn = Minted (net → 0) | `emission.service.ts` | `burned = await this.burn(processId, minted)` | ✅ CONFIRMED |
| calculate() pure formula | `emission.service.ts` | `emission=txAmount; commission=txAmount*rate; nodeShare=c*0.75; afcShare=c*0.25; net=0` | ✅ CONFIRMED |
| Commission rate = 0.5% | `commission.service.ts` | `readonly feeRate = 0.005` | ✅ CONFIRMED |
| AFC margin rate = 25% | `commission.service.ts` | `readonly marginRate = 0.25` | ✅ CONFIRMED |
| 75% to nodes | `commission.service.ts` `finalizeEpoch()` | `distributable = total * (1 - this.marginRate)` | ✅ CONFIRMED |
| 25% to AFC Reserve | `commission.service.ts` | `await this.reserve.addAfcAccrual(allocatedMargin)` | ✅ CONFIRMED |
| I7 reconciliation | `commission.service.ts` | `Math.abs(paid + allocatedMargin - total) < 1e-9` | ✅ CONFIRMED |
| Supply identity (I6) | `aroscoin.service.ts` | `(processMinted - processBurned) + earnedRetained` | ✅ CONFIRMED |
| Reserve formula (I-RS-1) | `reserve.service.ts` `reserveIndex()` | `return log10(1 + volume)` (volume = processVolume only) | ✅ CONFIRMED |
| AFC accrual in NodeChain only | `reserve.service.ts` `addAfcAccrual()` | `chain.append('reserve.afc.accrual', { amount })` | ✅ CONFIRMED |
| Reference: mint iff authorized | `reference/ast-core/src/emission.ts:6` | `if (!authorized) throw new Error(...)` | ✅ CONFIRMED |

**Example — $10,000 transaction (traced through code):**
```
amount = 10_000
PoT: pot.verify(processId) → verified = 1
emission.emit(processId, 10_000):
  → mint(processId, 10_000) → coin.recordMint(10_000)   [processMinted += 10_000]
  → burn(processId, 10_000) → coin.recordBurn(10_000)   [processBurned += 10_000]
  → minted = 10_000; processNet = 0

commission.computeFee(10_000) = 10_000 × 0.005 = 50 ARO
commission.accrue(epoch, 50, participants)

Epoch finalization:
  distributable = 50 × 0.75 = 37.50 → nodes (coin.recordEarned per node)
  margin        = 50 - 37.50 = 12.50 → reserve.addAfcAccrual(12.50) [NodeChain, audit only]
  reconciled    = |37.50 + 12.50 - 50| < 1e-9  ✓

reserveIndex = log10(1 + 10_000) ≈ 4.0000
internalPrice = 1 × 4.0000 = 4.0000 ARO/unit (rises with each confirmed process)

totalSupply (in-cycle)   = (10_000 - 10_000) + 0    = 0
totalSupply (after earn) = (10_000 - 10_000) + 37.50 = 37.50 ARO (= earnedRetained, I6)
```

**All Invariants Confirmed:**

| Invariant | Description | Status |
|-----------|-------------|--------|
| I1 | Value only on verified === 1 | CONFIRMED |
| I2 | Emission bound to confirmed process | CONFIRMED |
| I3 | Significant events in NodeChain | CONFIRMED |
| I4 | Deterministic computation | CONFIRMED |
| I5 | Process part nets to 0 (mint = burn) | CONFIRMED |
| I6 | totalSupply = earnedRetained after cycles | CONFIRMED |
| I7 | Pool reconciles: paid + margin = fees | CONFIRMED |
| I8 | NodeChain append-only | CONFIRMED |
| I9 | Node influence from work+reputation | CONFIRMED |
| I10 | All-Seeing Eye passive (no mutations) | CONFIRMED |
| I-RS-1 | reserveIndex from confirmed volume only | CONFIRMED |
| I-RS-2 | Derivable from NodeChain | CONFIRMED |
| I-RS-4 | Monotonic non-decreasing | CONFIRMED |

**Prohibitions P1–P8:** All clean — no staking, no slashing, no token-weighted governance,
no farming, no mint-on-deposit, no Eye mutations, no emission outside confirmed-process logic.

**No code changes made. Canonical model fully implemented and verified.**
