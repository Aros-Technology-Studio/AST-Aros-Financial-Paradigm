# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-gjc6sb`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical model; verify or correct.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation only (emission protocol, burn/mint rules, etc.) | Model-A historical docs; rate values cross-checked |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | **Audited ✓ Correct** |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | **Audited ✓ Correct** |
| `src/commission/commission.service.ts` | NestJS CommissionService | **Audited ✓ Correct** |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Audited ✓ Correct** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | **Audited ✓ Correct** |
| `src/invariants/invariants.spec.ts` | I1–I10 automated tests | **Audited ✓ All invariants covered** |
| `reference/ast-core/src/emission.ts` | Reference Model-1 core | Confirmed |
| `reference/ast-core/src/commission.ts` | Reference Model-1 core | Confirmed |
| `reference/ast-core/src/reserve.ts` | Reference Model-1 core | Confirmed |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Definitive on reserveIndex formula |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Definitive on fee/distribution |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Definitive on PoT gate |

`src/token/` does **not** exist — there is no legacy `token/` module. The production
emission logic lives entirely in `src/emission/`, `src/aroscoin/`, `src/commission/`,
and `src/reserve/`.

`01_coin_engine/` is documentation only, not executable or deprecated code.

---

## 2. Canonical Model (verified against specs and reference)

```
Emission     = Transaction Amount                              (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1 (gate is mandatory)
  … process executes …
  BURN(amount)  ← cycle completion; net = 0

Reserve (Model-1 spec formula — authoritative):
  reserveIndex   = log10(1 + totalProcessVolume)
  internalPrice  = base × reserveIndex                        (rises as confirmed work accumulates)
  AFC accruals   → NodeChain (audit trail); not in index formula per I-RS-1
```

**Authority order:** `docs/specs/AST_Reserve_AGENT_EN.md` and
`reference/ast-core/src/reserve.ts` are both unambiguous on the formula.
`01_coin_engine/coin_emission_model.md` is Model-A historical documentation and
is **not authoritative** per CLAUDE.md.

---

## 3. Conformance Audit — All Pass

| Component | Canonical Requirement | Result |
|-----------|----------------------|--------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated, burns on completion | ✓ Correct |
| `EmissionService.mint()` | Throws / refuses if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5% canonical default) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% AFC share) | ✓ Correct |
| Commission 75/25 distribution | 75% nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `Σpaid + margin == Σfees` per epoch, epsilon 1e-9 | ✓ Correct (I7) |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — grows with confirmed work | ✓ Correct |
| AFC accrual recording | `reserve.afc.accrual` event in NodeChain; audit trail intact | ✓ Correct (I3) |
| PoT gate | Binary verdict; `verified === 1` required for all downstream value | ✓ Correct (I1/I2) |
| NodeChain | Append-only, hash-continuous, deterministic | ✓ Correct (I3/I4/I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✓ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct (I10) |
| No Model-A constructs | No staking, no slashing, no mint-on-deposit, no token-weighted governance | ✓ Correct |

**No deviations found.** No code changes required.

---

## 4. Clarification: "AFC Reserve grows → price rises"

The task description states that a growing AFC Reserve raises the price of the next
emission. This is true in effect under Model-1, via the following mechanism:

1. Every confirmed process contributes its `amount` to `totalProcessVolume`.
2. Commission from that process routes 25% as an AFC accrual (recorded in NodeChain).
3. `reserveIndex = log10(1 + totalProcessVolume)` grows as confirmed volume accumulates.
4. `internalPrice = base × reserveIndex` therefore rises monotonically with volume.

The price rises because confirmed work volume grows — and AFC accruals are a derivative
of that same confirmed work. The Model-A docs (`01_coin_engine/coin_emission_model.md`)
express this as `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000`, but this is
historical documentation that contradicts the authoritative Model-1 spec
(`docs/specs/AST_Reserve_AGENT_EN.md`): `reserveIndex = log10(1 + totalProcessVolume)`.
The production code implements the Model-1 formula, which is correct.

---

## 5. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT verified === 1)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex (after process):     log10(1 + 10,000) ≈ 4.0000
internalPrice = base × 4.0000    → rises with each additional confirmed process
```

---

## 6. Invariant Coverage

| ID | Rule | Status |
|----|------|--------|
| I1 | Value exists only on `verified === 1` | ✓ Tested (`invariants.spec.ts:I1`) |
| I2 | Every emission bound to a confirmed process | ✓ Tested (`invariants.spec.ts:I2`) |
| I3 | All significant events in NodeChain | ✓ Tested (`invariants.spec.ts:I3`) |
| I4 | Deterministic: identical input → identical output | ✓ Tested (`invariants.spec.ts:I4`) |
| I5 | Process part nets to 0 (`processMinted == processBurned`) | ✓ Tested (`invariants.spec.ts:I5`) |
| I6 | `totalSupply == earnedRetained` after burns | ✓ Tested (`invariants.spec.ts:I6`) |
| I7 | Epoch pool reconciles: `Σpaid + margin == Σfees` | ✓ Tested (`invariants.spec.ts:I7`) |
| I8 | NodeChain append-only; hash-continuous | ✓ Tested (`invariants.spec.ts:I8`) |
| I9 | Node influence from work+reputation; no stake field | ✓ Tested (`invariants.spec.ts:I9`) |
| I10 | Eye passive: no state mutation on observe | ✓ Tested (`invariants.spec.ts:I10`) |
| I-RS-1 | Reserve grows only from confirmed volume | ✓ Formula uses `totalProcessVolume` only |
| I-RS-2 | `reserveIndex` derivable from NodeChain history | ✓ Recomputed from chain on each call |
| I-RS-4 | `reserveIndex` monotonic non-decreasing | ✓ `log10(1 + volume)` is monotonic in volume |

---

## 7. Files Changed

```
AGENT_CORE_REPORT.md    Updated: fresh 2026-06-19 audit; all components confirmed conformant.
```

No production code changes were required. The canonical 1:1 emission model is fully
implemented and all invariants are tested.

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #... | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec (removed `totalAfcReserve`) |
| **This run** | `claude/inspiring-cannon-gjc6sb` | Full re-audit 2026-06-19; all components confirmed conformant; no changes needed |
