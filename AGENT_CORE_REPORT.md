# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-n4rn6g`
**Date:** 2026-06-30
**Task:** Audit ArosCoin emission logic against the canonical Model-1 specification; confirm or correct deviations.

---

## 1. Directories and Files Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Spec docs: aro_emission_protocol.md, coin_emission_model.md, etc. | Documentation layer |
| `10_proof_of_transaction_engine/` | PoT documentation | Documentation layer |
| `src/token/` | Does not exist (Model-A artifact path) | — |
| `src/emission/emission.service.ts` | EmissionService — production emission logic | Audited ✓ |
| `src/emission/emission.service.spec.ts` | Jest integration tests | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | ArosCoinService — unit ledger | Audited ✓ |
| `src/commission/commission.service.ts` | CommissionService — fee/epoch settlement | Audited ✓ |
| `src/reserve/reserve.service.ts` | ReserveService — reserveIndex / AFC | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | OrchestratorService — full lifecycle | Audited ✓ |
| `src/nodes/nodes.service.ts` | NodesService — workforce registry | Audited; P8 fix applied |
| `reference/ast-core/src/emission.ts` | Reference implementation | Cross-checked |
| `reference/ast-core/src/aroscoin.ts` | Reference implementation | Cross-checked |
| `reference/ast-core/src/invariants.test.ts` | Reference invariant tests | Cross-checked |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_ArosCoin_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |

`src/token/` does not exist. The production emission code lives in `src/emission/` and related
NestJS modules. All references to `src/token/emission.service.ts` in docs are Model-A artifacts
that were corrected in a prior session.

---

## 2. Canonical Model (verified against specs and reference)

```
Emission     = Transaction Amount                    (1:1 — no multiplier)
Commission C = Transaction Amount × feeRate          (default feeRate = 0.005 → 0.5%)
  Node Share = C × 0.75                             (75% → processing nodes by PoT weight)
  AFC Share  = C × 0.25                             (25% → AFC reserve, audit trail in NodeChain)

Canonical lifecycle per confirmed process (reference orchestrator.ts, lines 57-68):
  MINT(amount)          ← PoT verified === 1
  commission.accrue()   ← fee accrued to open epoch
  BURN(amount)          ← cycle completion; net → 0

Supply identity (I6):
  totalSupply = (processMinted − processBurned) + earnedRetained
  After all cycles: processMinted == processBurned → totalSupply == earnedRetained

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)    ← spec I-RS-1/2; confirmed volume only
  internalPrice = base × reserveIndex              ← rises with confirmed work accumulation
  AFC accruals  → NodeChain event (audit); not in reserveIndex formula (spec I-RS-1)
```

---

## 3. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated; verified === 1 required)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event (audit trail)
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (after process): log10(1 + 10,000) ≈ 4.0001
internalPrice = base × 4.0001  → rises monotonically with each confirmed process (I-RS-4)
```

---

## 4. Conformance Verdict — Production Code is Canonical

| Component | Canonical Requirement | Status |
|-----------|----------------------|--------|
| `EmissionService.emit()` | PoT-gated; mint 1:1 → accrue → burn | ✓ Canonical |
| `EmissionService.mint()` | Throws `Error` when `verified !== 1` | ✓ Canonical |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Canonical |
| `EmissionService.calculate()` | Pure formula: emission=txAmount, commission=txAmount×rate, nodeShare=commission×0.75, afcShare=commission×0.25, net=0 | ✓ Canonical |
| `ArosCoinService` three-tally ledger | `processMinted`, `processBurned`, `earnedRetained` | ✓ Canonical |
| `ArosCoinService.totalSupply()` | `(processMinted − processBurned) + earnedRetained` | ✓ Canonical |
| `CommissionService.feeRate` | `0.005` (0.5%) | ✓ Canonical |
| `CommissionService.marginRate` | `0.25` (25% AFC) | ✓ Canonical |
| Commission node distribution | 75% by PoT-confirmed participation weight, post-factum | ✓ Canonical |
| Commission AFC routing | `reserve.addAfcAccrual(allocatedMargin)` | ✓ Canonical |
| Pool reconciliation | `Σ(paid) + afcMargin == Σ(fees)` within 1e-9 | ✓ Canonical |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` | ✓ Canonical |
| AFC accruals audit | `reserve.afc.accrual` events in NodeChain; not in formula | ✓ Canonical |
| Orchestrator lifecycle order | mint → commission.accrue → burn (reference order) | ✓ Canonical |
| All-Seeing Eye | Passive: observe, log, signal; no state mutation | ✓ Canonical |
| NodeChain | Append-only; hash-continuous; `reconstruct()` breaks on tamper | ✓ Canonical |
| Nodes service | Weight = reputation × uptime; derived from confirmed execution history (I9) | ✓ Canonical |
| PoT service | Idempotent verify; binary verdict; gates all downstream value | ✓ Canonical |

---

## 5. Deviations Found and Resolved (cumulative history)

### 5.1 Prior session — Commission rate: 1% → 0.5%

The commission rate was `0.01` (1%). Canonical spec is `0.005` (0.5%).

**Fixed in prior session.** Current `CommissionService.feeRate = 0.005` ✓

### 5.2 Prior session — Orchestrator lifecycle order

The orchestrator called `emission.emit()` (which bundles mint + burn atomically), then commission
accrual — inverting the canonical reference order where burn follows commission accrual.

**Reference canonical order** (`reference/ast-core/src/orchestrator.ts`):
```
mint(amount) → commission.accrue(fee) → burn(amount)
```

**Fixed in prior session.** Current orchestrator:
```
emission.mint(processId, amount)         // Step 6a
commission.accrue(epoch, fee, parts)     // Step 7
emission.burn(processId, minted)         // Step 6b (post-commission)
```
✓ Matches reference exactly.

### 5.3 Prior session — `01_coin_engine/coin_emission_model.md` corrections

Three documentation errors corrected:

| # | Before | After |
|---|--------|-------|
| Code path | `src/token/emission.service.ts` (never existed) | `src/emission/emission.service.ts` |
| reserveIndex formula | `1.0 + sqrt(totalAfcReserve) / 10_000` | `log10(1 + totalProcessVolume)` |
| API methods | Non-existent reference methods | Actual `EmissionService` API + 3-step lifecycle |

### 5.4 This session (2026-06-30) — P8 violation in `src/nodes/nodes.service.ts`

**Rule:** P8 — positive definitions only in code comments/docs; negation is forbidden.

**Before (lines 20–22):**
```
 * Influence here flows purely from confirmed work and reputation: the entity holds no
 * stake or stakedBalance column and the service never mutates a token balance to
 * reward or punish a node. That keeps invariant I9 and prohibitions P1/P2 intact.
```
This defines the entity by what it lacks (no stake column, never mutates balance).

**After:**
```
 * Influence flows from confirmed work and reputation (execution counters, uptime, reputation
 * score). Node weight is derived exclusively from the reputation formula per spec (I9, P1, P2).
```
Positive statement of what the service IS and DOES. ✓

---

## 6. Invariant Coverage

| ID | Rule | Coverage |
|----|------|----------|
| I1 | Value only when PoT verified === 1 | `EmissionService.emit()` PoT gate |
| I2 | Every emission bound to a confirmed process | `EmissionService.mint()` throws on unverified |
| I3 | All significant events in NodeChain | Full lifecycle events appended by each service |
| I4 | Deterministic: same input → same result | Sorted node iteration; log formula; idempotent PoT |
| I5 | Process part nets to 0 (processNet → 0) | `burn(minted)` called after commission accrual |
| I6 | `totalSupply = earnedRetained` after burns | Three-tally identity holds; test confirms |
| I7 | Pool reconciles: `paid + margin == fees` | Epsilon check in `finalizeEpoch()` |
| I8 | NodeChain append-only, hash-continuous | `reconstruct()` breaks on tamper |
| I9 | Node influence from work+reputation | Weight = reputation × uptime; no stake/balance fields |
| I10 | Eye passive: no state change | `compareSupply`/`verifyChain`/`log` are read-only or append-log only |
| I-EM-1 | Causality: every mint bound to verified process | Confirmed |
| I-EM-2 | PoT gate: no mint without verified === 1 | Confirmed; `mint()` spec test passes |
| I-EM-3 | Cycle symmetry: process part burned on completion | Confirmed; `processNet` test passes |
| I-RS-1 | ReserveIndex grows from confirmed volume only | `log10(1 + totalProcessVolume)`; AFC accruals separate |
| I-RS-2 | ReserveIndex derivable from NodeChain, not set manually | Recomputed from history on each call |
| I-RS-4 | Monotonic non-decreasing | `log10(1 + volume)` is monotonic in volume |

---

## 7. Prohibition Grep Results

Scanned `src/` (production code, excluding `.spec.ts`):

| ID | Forbidden Pattern | Result |
|----|-------------------|--------|
| P1 | `staking / stakedBalance / stake_freeze` | Clean (doc comment reference fixed this session) |
| P2 | `slashing against balance` | Clean |
| P3 | `token-weighted governance / vote-by-token-balance` | Clean |
| P4 | `farming / passive yield` | Clean |
| P5 | `mint-on-deposit / crypto_to_aroscoin custodial` | Clean |
| P6 | Eye halting/reverting/voting/state-change | Clean |
| P7 | Emission outside confirmed-process logic | Clean |
| P8 | Defining entities by negation in comments/docs | Fixed this session (`nodes.service.ts`) |

---

## 8. Files Changed (this session)

```
src/nodes/nodes.service.ts        P8 fix: negation comment → positive language
AGENT_CORE_REPORT.md              Updated with this session's audit findings
```

---

## 9. Definition of Done — Confirmed

- [x] All modules compile and are wired into the Nest app
- [x] Relevant invariants (I1–I10) satisfied by production services
- [x] No prohibited construct present in `src/` (P1–P8 clean)
- [x] Public APIs documented with positive-language comments
- [x] Emission model: 1:1, PoT-gated, mint → accrue → burn, net → 0
- [x] Commission: 0.5% rate, 75% nodes / 25% AFC, post-factum by weight
- [x] Reserve: `reserveIndex = log10(1 + confirmedVolume)`, monotonic

---

*Supersedes all prior AGENT_CORE_REPORT.md entries.*
