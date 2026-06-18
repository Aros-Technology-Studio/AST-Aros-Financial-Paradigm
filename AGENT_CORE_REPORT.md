# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-z5xqqn`
**Date:** 2026-06-18
**Task:** Audit ArosCoin emission logic against the canonical model; correct any deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Canonical model documentation: `coin_emission_model.md`, `burn_and_mint_rules.md`, `aro_emission_protocol.md`, `payment_distribution.md` | Spec reference for canonical rates (0.5%, 75/25 split) |
| `10_proof_of_transaction_engine/` | PoT documentation: challenge/response, node role assignment, validation logic | Historical; no emission formulas |
| `src/token/` | Directory does not exist. Emission logic lives in `src/emission/` | — |
| `src/emission/emission.service.ts` | NestJS EmissionService — PoT-gated mint/burn | ✓ Canonical |
| `src/emission/emission.module.ts` | Module wiring: ArosCoinModule, PotModule, NodeChainModule | ✓ Canonical |
| `src/aroscoin/aroscoin.service.ts` | Three-tally unit ledger | ✓ Canonical |
| `src/commission/commission.service.ts` | 0.5% fee rate, 75/25 split, AFC routing | ✓ Canonical |
| `src/commission/commission.module.ts` | ReserveModule imported for AFC routing | ✓ Canonical |
| `src/reserve/reserve.service.ts` | AFC accrual tracking, reserveIndex formula | ✓ Canonical |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle: passes `input.amount` → `emission.emit()` (1:1) | ✓ Canonical |
| `reference/ast-core/src/emission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/aroscoin.ts` | Reference implementation | Audited |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Audited |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Audited |

`01_coin_engine/` is **documentation** (not deprecated production code). The production
implementation lives in `src/emission/` and related NestJS modules.

---

## 2. Canonical Model

```
Emission     = Transaction Amount                         (1:1, no multiplier)
Commission C = Transaction Amount × feeRate               (default 0.5%)
  Node Share = C × 0.75                                  (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                  (25% → Reserve AFC)

ARO lifecycle per confirmed process:
  MINT(amount)   ← PoT verified === 1
  … process executes …
  BURN(amount)   ← cycle completion; net contribution = 0

Reserve index = log10(1 + totalProcessVolume + totalAfcReserve)
Internal price = base × reserveIndex                      (rises as reserve accumulates)
```

Sources (highest authority first):
- `docs/specs/AST_Emission_AGENT_EN.md` — `emissionVolume ∝ process.amount`; `mint ⟺ verified=1`
- `docs/specs/AST_Commission_AGENT_EN.md` — 75/25 split, post-factum, epoch-level
- `reference/ast-core/src/emission.ts` — reference mint/burn implementation
- `01_coin_engine/coin_emission_model.md` — 1:1 formula, 0.5% default rate, 75/25 split

---

## 3. Current Code Conformance — All Canonical

### 3.1 EmissionService (`src/emission/emission.service.ts`)

| Requirement | Implementation | Verdict |
|-------------|----------------|---------|
| Emission = txAmount (1:1) | `emit(processId, amount)` mints exactly `amount`; orchestrator passes `input.amount` | ✓ |
| PoT gate: mint only on `verified === 1` | `emit()` and `mint()` both read `pot.getVerdict(processId)` and reject on `verified !== 1` | ✓ |
| Mint throws if unverified | `mint()` throws with `no PoT confirmation` message (I2) | ✓ |
| Burn mirrors mint on completion | `burn(processId, minted)` called immediately after `mint()` in `emit()` | ✓ |
| Process part nets to 0 | `minted === burned` per cycle; `processNet → 0` (I5) | ✓ |
| Events in NodeChain | `chain.append('emission.minted', ...)` and `chain.append('emission.burned', ...)` (I3) | ✓ |

### 3.2 ArosCoinService (`src/aroscoin/aroscoin.service.ts`)

| Requirement | Implementation | Verdict |
|-------------|----------------|---------|
| Three-tally ledger | `processMinted`, `processBurned`, `earnedRetained` persisted in `ArosCoinLedger` | ✓ |
| Supply derivable | `totalSupply = (processMinted − processBurned) + earnedRetained` (I6) | ✓ |
| No free issuance | `recordMint/recordBurn/recordEarned` only; no deposit or purchase path (P5) | ✓ |
| Internal price | `internalPrice(reserveIndex) = base × reserveIndex` | ✓ |

### 3.3 CommissionService (`src/commission/commission.service.ts`)

| Requirement | Implementation | Verdict |
|-------------|----------------|---------|
| Fee rate 0.5% | `feeRate = 0.005` | ✓ |
| 75% to nodes | `distributable = total × (1 − 0.25) = total × 0.75` | ✓ |
| 25% to AFC Reserve | `marginRate = 0.25`; `reserve.addAfcAccrual(allocatedMargin)` | ✓ |
| Post-factum payment | `finalizeEpoch()` pays after all processes complete | ✓ |
| PoT-gated participation | Only `verified === 1` processes contribute weight (I-CM-1/I-CM-2) | ✓ |
| Pool reconciles | `paid + margin == totalFees` within ε=1e-9 (I7) | ✓ |
| Deterministic | Node IDs sorted before iteration (I4) | ✓ |

### 3.4 ReserveService (`src/reserve/reserve.service.ts`)

| Requirement | Implementation | Verdict |
|-------------|----------------|---------|
| AFC accrual from Commission | `addAfcAccrual(amount)` appends `reserve.afc.accrual` to NodeChain | ✓ |
| reserveIndex includes AFC | `log10(1 + totalProcessVolume + totalAfcReserve)` | ✓ |
| Derivable (not stored) | Recomputed from NodeChain history on every read (I-RS-2) | ✓ |
| Monotonic non-decreasing | Volume can only accumulate; append-only chain (I-RS-4) | ✓ |
| Price grows with reserve | `internalPrice(base) = base × reserveIndex` → rises as AFC accumulates | ✓ |

### 3.5 OrchestratorService (`src/orchestrator/orchestrator.service.ts`)

| Lifecycle Step | Implementation | Verdict |
|----------------|----------------|---------|
| initiation → recording | `recording.capture(processId, 'initiation', { amount })` | ✓ |
| admissibility gate | Returns early with `reason: 'inadmissible'` if `!input.admissible` | ✓ |
| node assignment | `resolveAssignedNodes()` + `recording.capture('task_assignment', ...)` | ✓ |
| execution + PoT verify | `pot.verify(processId)` returns binary verdict | ✓ |
| 1:1 emission | `emission.emit(processId, amount)` where `amount = input.amount` (txAmount) | ✓ |
| fee accrual | `commission.computeFee(amount)` = `amount × 0.005` | ✓ |
| reserve update (derived) | `reserve.reserveIndex()` reads history after emission | ✓ |
| final record | `recording.capture('final_status', ...)` | ✓ |
| Eye passive throughout | `eye.log(...)` and `eye.compareSupply(...)` only; no state mutations (I10) | ✓ |

---

## 4. End-to-End: $10,000 Transaction Example

```
TX Amount     = 10,000 ARO                         ← input.amount
Emission      = 10,000 ARO  ← MINT, PoT-gated     (1:1, no multiplier)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO             → coin.recordEarned (epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO             → reserve.addAfcAccrual → NodeChain
Burn          = 10,000 ARO  ← BURN (cycle complete)

processNet    = 10,000 − 10,000 = 0               ✓ I5
totalSupply   = 0 + earnedRetained                 ✓ I6

reserveIndex before AFC:  log10(1 + 10,000 + 0)    ≈ 4.0000
reserveIndex after epoch: log10(1 + 10,000 + 12.5) ≈ 4.0005
internalPrice = base × 4.0005 → rises               ✓ "AFC Reserve grows → next price higher"
```

---

## 5. Invariant Coverage

| ID | Rule | Status |
|----|------|--------|
| I1 | Value exists only when PoT verified == 1 | ✓ Gate in `emit()` and `mint()` |
| I2 | Every emission bound to a confirmed process | ✓ `mint()` throws without `verified === 1` |
| I3 | Every significant event in NodeChain | ✓ `emission.minted`, `emission.burned`, `reserve.afc.accrual`, commission epochs |
| I4 | Deterministic: same input → same result | ✓ Node IDs sorted; deterministic weight calc |
| I5 | Earned retained; process part burned; processNet → 0 | ✓ mint then burn in same cycle |
| I6 | `totalSupply = (minted−burned) + earnedRetained` | ✓ Derivable; AFC not in `earnedRetained` |
| I7 | Commission pool reconciles: `paid + margin == fees` | ✓ `allocatedMargin = total − paid` |
| I8 | NodeChain append-only and hash-continuous | ✓ `chain.append()` only |
| I9 | Node influence from work+reputation, not balance | ✓ `currentWeight(nodeId)` from reputation |
| I10 | All-Seeing Eye passive: signals only, no state change | ✓ Eye only reads and logs |

All prohibitions P1–P8 confirmed absent from production code.

---

## 6. Prior Corrections (already merged)

The following deviations were identified and corrected in previous sessions (PR #298):

| Deviation | Was | Fixed To |
|-----------|-----|----------|
| Commission fee rate | `0.01` (1%) | `0.005` (0.5%) |
| Commission split | 80/20 | 75/25 canonical |
| AFC margin routing | `coin.recordEarned(margin)` (inflated totalSupply) | `reserve.addAfcAccrual(margin)` |
| MARGIN_RECIPIENT label | `'AST'` | `'AFC_RESERVE'` |
| ReserveService AFC tracking | Missing | `addAfcAccrual()`, `totalAfcReserve()`, updated `reserveIndex()` |
| CommissionModule | ReserveModule not imported | ReserveModule added to imports |

All corrections are present in the current codebase. This audit confirms the implementation
is canonical and no further code changes are required.

---

## 7. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| Initial | `agent/core-emission` | First canonical 1:1 emission model |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| **This run** | `claude/inspiring-cannon-z5xqqn` | Full audit confirmation; canonical state verified |
