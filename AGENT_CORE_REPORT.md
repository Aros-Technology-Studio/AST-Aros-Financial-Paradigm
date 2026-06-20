# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `agent/core-emission`
**Date:** 2026-06-20
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation (aro_emission_protocol.md, coin_emission_model.md, etc.) | Cross-reference docs; rates verified |
| `10_proof_of_transaction_engine/` | PoT documentation | Cross-reference; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | Passed (101/101) |
| `reference/ast-core/src/emission.ts` | Reference implementation | Verified |
| `reference/ast-core/src/commission.ts` | Reference implementation | Verified |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Verified |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Verified |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Verified |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Verified |

`src/token/` does not exist — no legacy token module. The production emission logic lives
entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

Module `01_coin_engine/` is documentation only, not deprecated code. No executable
content resides there.

`10_proof_of_transaction_engine/` is documentation only. The PoT runtime lives in
`src/pot/pot.service.ts`.

---

## 2. Canonical Model (verified against specs)

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
  AFC accruals   → NodeChain (audit trail; do not enter index formula per I-RS-1)
```

Sources of authority: `docs/specs/AST_Reserve_AGENT_EN.md` (highest) and
`reference/ast-core/src/reserve.ts`. Both agree on the formula.

---

## 3. Audit Results — All Components Conform

| Component | Canonical Requirement | Code | Verdict |
|-----------|----------------------|------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated before mint | `emit.service.ts:55–61` | ✓ |
| `EmissionService.mint()` | Throws if `verified !== 1` (I-EM-2) | `emit.service.ts:71–76` | ✓ |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | `emit.service.ts:83–87` | ✓ |
| `ArosCoinService` ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | `aroscoin.service.ts:97` | ✓ |
| `CommissionService.feeRate` | 0.005 (0.5%) | `commission.service.ts:57` | ✓ |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | `commission.service.ts:60` | ✓ |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`; 25% via `reserve.addAfcAccrual` | `commission.service.ts:118–138` | ✓ |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | `commission.service.ts:140` | ✓ |
| PoT gate | Binary verdict `verified === 1`; gates all emission and commission | `pot.service.ts` | ✓ |
| NodeChain | Append-only, hash-continuous | `nodechain.service.ts` | ✓ |
| Nodes | Work+reputation weight; no stake or slashing fields | `nodes.service.ts` | ✓ |
| All-Seeing Eye | Passive: observe, log, compareSupply; no state mutations | `all-seeing-eye.service.ts` | ✓ |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)`; AFC accruals separate | `reserve.service.ts:80` | ✓ |

**No code changes required.** All components implement the canonical model exactly.

---

## 4. Canonical Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, gated on PoT verified === 1)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → post-factum at epoch finalization by PoT weight
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event
Burn          = 10,000 ARO   ← BURN (net circulating supply change = 0)

After process:
  processNet      = 0     (minted − burned = 0)
  totalSupply     = 0 + earnedRetained   (I6)
  reserveIndex    = log10(1 + 10_000) ≈ 4.0000
  internalPrice   = base × 4.0000   (rises monotonically with confirmed work)
```

---

## 5. Invariant Test Results (101/101 PASS)

| ID | Rule | Test Result |
|----|------|-------------|
| I1 | Value exists only on PoT verified === 1 | PASS |
| I2 | Every emission bound to confirmed process | PASS |
| I3 | Every significant event in NodeChain | PASS |
| I4 | Deterministic: same input → same result | PASS |
| I5 | Process part burns; processNet → 0 | PASS |
| I6 | `totalSupply = earnedRetained` after cycles | PASS |
| I7 | Pool reconciles: `paid + margin == fees` | PASS |
| I8 | NodeChain append-only, hash-continuous | PASS |
| I9 | Node influence from work+reputation, not balance | PASS |
| I10 | All-Seeing Eye passive: no state change | PASS |

Prohibition gates (P1–P8) confirmed absent: no staking, no slashing, no token-weighted
governance, no farming, no mint-on-deposit, no Eye enforcement code, no unguarded emission.

---

## 6. Discrepancy: `01_coin_engine/` vs Authoritative Spec

The `01_coin_engine/coin_emission_model.md` and `aro_emission_protocol.md` documents state
a different reserve index formula:

```
# 01_coin_engine/coin_emission_model.md (lower authority — historical doc)
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

Per the authority order in CLAUDE.md:
1. `docs/specs/AST_Reserve_AGENT_EN.md` → `reserveIndex = log10(1 + totalProcessVolume)`
2. `reference/ast-core/src/reserve.ts` → `log10(1 + this.totalProcessVolume)`

Both highest-authority sources agree. The `01_coin_engine/` formula is Model-A historical
documentation and does not override the spec. The production code correctly follows the spec.

---

## 7. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| Initial | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec |
| **This run** | `agent/core-emission` | Full re-audit; canonical model confirmed; 101/101 tests pass |
