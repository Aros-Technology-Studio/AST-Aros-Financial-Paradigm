# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-808b9p`
**Date:** 2026-06-30
**Task:** Audit ArosCoin emission logic against the canonical 1:1 model; correct any deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only: `coin_emission_model.md`, `aro_emission_protocol.md`, `burn_mechanism.md`, etc. | Canonical spec docs — formulas cross-checked |
| `10_proof_of_transaction_engine/` | PoT documentation only | No emission formulas |
| `src/token/` | Does **not exist** | — |
| `src/emission/emission.service.ts` | NestJS `EmissionService` — production code | Audited ✓ |
| `src/emission/emission.service.spec.ts` | Full invariant test suite | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS `ArosCoinService` (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS `CommissionService` | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS `ReserveService` | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/commission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Audited |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

**Note on `01_coin_engine/`:** This module is **documentation**, not deprecated code.
Its `coin_emission_model.md` is the canonical formula reference. No production TypeScript lives here.
The production emission engine is `src/emission/emission.service.ts`.

**Note on `src/token/`:** This directory does not exist. The task referred to it speculatively.
All unit-of-account logic lives in `src/aroscoin/`.

---

## 2. Canonical Model — Formula Specification

From `01_coin_engine/coin_emission_model.md` and `docs/specs/AST_Emission_AGENT_EN.md`:

```
Emission     = Transaction Amount          (1:1, no multiplier)
Commission C = Transaction Amount × rate   (default 0.5%)
  Node Share = C × 0.75                   (75% → processing nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                   (25% → AFC reserve, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)   ← PoT verdict verified === 1
  … process executes …
  BURN(amount)   ← cycle completion; net = 0

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)   ← confirmed work only (I-RS-1/I-RS-2)
  internalPrice = base × reserveIndex              ← rises as confirmed work accumulates
```

**Example: $10,000 transaction**
```
TX Amount       = 10,000 ARO
Emission        = 10,000 ARO  (minted 1:1)
Commission      = 10,000 × 0.005 = 50 ARO
  Node pool     = 50 × 0.75  = 37.50 ARO
  AFC reserve   = 50 × 0.25  = 12.50 ARO
Burn            = 10,000 ARO  (destroyed on cycle completion)
Net circulating change = 0
```

---

## 3. Audit Findings

### 3.1 EmissionService (`src/emission/emission.service.ts`)

**Status: CONFORMS — no changes required.**

| Canonical requirement | Implementation | Verdict |
|---|---|---|
| `emission = txAmount` (1:1) | `calculate()`: `emission = txAmount` | ✓ |
| `commission = txAmount × 0.005` | `calculate()`: `commission = txAmount * commissionRate` (default `0.005`) | ✓ |
| `nodeShare = commission × 0.75` | `calculate()`: `nodeShare: commission * 0.75` | ✓ |
| `afcShare = commission × 0.25` | `calculate()`: `afcShare: commission * 0.25` | ✓ |
| `net = 0` (mint then burn) | `emit()`: calls `mint()` then `burn()` symmetrically | ✓ |
| PoT gate mandatory | `emit()` checks `verdict.verified === 1`; returns `authorized: false` otherwise | ✓ |
| `mint()` refuses without PoT | `mint()` throws `"no PoT confirmation (verified === 1 required)"` | ✓ |
| Mint recorded in NodeChain | `chain.append('emission.minted', { processId, minted: amount })` | ✓ |
| Burn recorded in NodeChain | `chain.append('emission.burned', { processId, burned: amount })` | ✓ |

The `calculate()` method is a pure function (no side-effects, no ledger writes) and matches
the `$10,000 reference example` from `coin_emission_model.md` exactly.

### 3.2 ArosCoinService (`src/aroscoin/aroscoin.service.ts`)

**Status: CONFORMS.**

Three-tally ledger (`processMinted`, `processBurned`, `earnedRetained`) with derived identity:

```
totalSupply = (processMinted − processBurned) + earnedRetained
```

Because the process part is minted then burned within the same confirmed process,
`processNet → 0` after cycle completion, leaving `totalSupply = earnedRetained` (spec I-AC-5).
No deposit path, no `mint-on-deposit`, no custodial conversion (P5).

### 3.3 CommissionService (`src/commission/commission.service.ts`)

**Status: CONFORMS.**

- `feeRate = 0.005` (0.5%) — matches canonical default.
- `marginRate = 0.25` (25% AFC share) — the remaining 75% is distributed to nodes.
- `finalizeEpoch()` distributes node payments by PoT-confirmed participation weight (I-CM-2).
- AFC share routed to `ReserveService` via `commission.epoch.finalized` NodeChain event.
- Epoch pool reconciles: `Σ(payments) + afcMargin = Σ(fees)` within `1e-9` epsilon (I-CM-4).

### 3.4 ReserveService (`src/reserve/reserve.service.ts`)

**Status: CONFORMS.**

```
reserveIndex = log10(1 + totalProcessVolume)
```

`totalProcessVolume` is the sum of two NodeChain signals:
1. `emission.minted` events — process part minted per PoT-verified process.
2. `commission.epoch.finalized` `operationalMargin` — AFC share (25%) of each epoch pool.

Both signals are behind the PoT gate, so confirmed-work volume only feeds the index (I-RS-1).
Index recomputed from history on every read (I-RS-2), monotonically non-decreasing (I-RS-4).

### 3.5 OrchestratorService (`src/orchestrator/orchestrator.service.ts`)

**Status: CONFORMS.**

Full Model-1 lifecycle in canonical order:
```
initiation → admissibility → node assignment → execution →
PoT verify → emission (mint+burn) → fee accrual → reserve update → final record
```
All-Seeing Eye observes passively throughout and never mutates state (I10).

---

## 4. Invariants Verified

| Invariant | Description | Code path | Status |
|---|---|---|---|
| I1 | Emission only on PoT-verified processes | `EmissionService.emit()` PoT gate | ✓ |
| I2 | No mint without `verified === 1` | `EmissionService.mint()` guard | ✓ |
| I4 | Deterministic execution | Pure `calculate()`; idempotent ledger writes | ✓ |
| I5 | Process part nets to zero | `mint()` + `burn()` symmetric within same cycle | ✓ |
| I6 | `totalSupply = earnedRetained` post-cycle | ArosCoin ledger identity | ✓ |
| I7 | Epoch pool reconciles to zero remainder | CommissionService `RECONCILE_EPSILON = 1e-9` | ✓ |
| I10 | All-Seeing Eye is passive | Eye only reads, logs, compares — no state writes | ✓ |
| I-EM-1 | Emission sole minter | No other service calls `recordMint` except via EmissionService | ✓ |
| I-EM-2 | PoT gate mandatory | Double-checked in both `emit()` and `mint()` | ✓ |
| I-EM-3 | Process part net = 0 | Mint and burn amounts equal; `net: 0` in `calculate()` | ✓ |
| I-RS-1 | Reserve grows from confirmed work only | Both NodeChain signals are PoT-gated | ✓ |
| I-RS-2 | Reserve index recomputed from history | `totalProcessVolume()` reads full NodeChain on each call | ✓ |
| I-RS-4 | Reserve index monotonically non-decreasing | `log10(1 + vol)` grows with vol | ✓ |
| P5 | No mint-on-deposit / custodial conversion | No deposit path in ArosCoin or Emission | ✓ |
| P7 | Unverified process mints nothing | `authorized: false, minted: 0, burned: 0` | ✓ |

---

## 5. Test Coverage

`src/emission/emission.service.spec.ts` covers:

| Test | Invariants |
|---|---|
| Verified process: minted = burned = amount, processNet = 0, totalSupply = 0 | I1/I5/I6 |
| Unverified process: minted = 0, burned = 0 | I1/I2/P7 |
| `verified: 0` process also refused | P7 |
| `mint()` throws for unverified process | I2 |
| `emission.minted` / `emission.burned` events recorded in NodeChain | I3 |
| Identical verified emissions yield identical supply outcomes | I4 |
| `calculate($10,000)` returns canonical breakdown | coin_emission_model.md |
| Custom commission rate accepted | — |
| `calculate()` has no ledger side effects | I-EM-1 |

---

## 6. Conclusion

**The production codebase fully implements the canonical 1:1 emission model.**

No deviations from the canonical specification were found. The code was already brought into
full conformance in a prior audit run (`e7b50a7 feat: canonical 1:1 emission model implementation`).

This report reflects a fresh end-to-end audit against the current `main` branch (merged into
`claude/inspiring-cannon-808b9p` as of 2026-06-30) confirming continued conformance.

No code changes were required. The emission model is production-ready.

---

## 7. File Map

```
src/emission/emission.service.ts      ← canonical EmissionService (PoT-gated mint/burn, calculate)
src/aroscoin/aroscoin.service.ts      ← unit ledger (processMinted, processBurned, earnedRetained)
src/commission/commission.service.ts  ← 75/25 split, post-factum epoch settlement
src/reserve/reserve.service.ts        ← reserveIndex = log10(1 + totalProcessVolume)
src/orchestrator/orchestrator.service.ts ← full Model-1 lifecycle
reference/ast-core/src/emission.ts    ← reference (behavior is correct by construction)
01_coin_engine/coin_emission_model.md ← canonical formula documentation
docs/specs/AST_Emission_AGENT_EN.md   ← highest-authority spec
```
