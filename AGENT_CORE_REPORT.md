# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-ghkvxa`
**Date:** 2026-06-20
**Task:** Audit ArosCoin emission logic against the canonical model; correct any deviations.

---

## 1. Directories Examined

| Path | Content | Status |
|------|---------|--------|
| `01_coin_engine/` | Historical Model-A documentation (markdown only, no executable code) | Reviewed — non-authoritative per CLAUDE.md |
| `10_proof_of_transaction_engine/` | Historical PoT documentation (markdown only) | Reviewed — non-authoritative |
| `src/token/` | **Does not exist** — historical Model-A path referenced in old docs | Migrated to `src/emission/` |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | ✅ Audited, canonical |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | ✅ Audited, canonical |
| `src/commission/commission.service.ts` | NestJS CommissionService (75/25 split) | ✅ Audited, canonical |
| `src/reserve/reserve.service.ts` | NestJS ReserveService (capitalization index) | ✅ Audited, canonical |
| `src/orchestrator/orchestrator.service.ts` | Full 9-step lifecycle orchestration | ✅ Audited, canonical |
| `src/invariants/invariants.spec.ts` | I1–I10 automated invariant tests | ✅ All passing |
| `reference/ast-core/src/emission.ts` | Reference implementation (authority tier 2) | Read |
| `reference/ast-core/src/aroscoin.ts` | Reference implementation (authority tier 2) | Read |
| `docs/specs/AST_Emission_AGENT_EN.md` | Emission spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Reserve spec (highest authority) | Read |

### Key findings on examined paths

**`01_coin_engine/`** contains historical Model-A markdown documentation. Two discrepancies
with the current production code are expected and correct:

1. `coin_emission_model.md` cites `src/token/emission.service.ts` as the implementation
   location. That path no longer exists; the code was migrated to `src/emission/emission.service.ts`
   as part of the Model-A → Model-1 rewrite.

2. `coin_emission_model.md` lists a different `reserveIndex` formula:
   `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000`. The production code
   correctly uses the spec-authoritative formula: `log10(1 + totalProcessVolume)`.

Both discrepancies reside in non-authoritative historical docs. Per CLAUDE.md the
canonical authority is `docs/specs/` and `reference/ast-core/`, not `01_coin_engine/`.

**`src/token/`** does not exist. No deprecated module was found — the old Model-A token
service was completely replaced by the `src/emission/` + `src/aroscoin/` module pair.

---

## 2. Canonical Emission Model (as verified against specs)

```
Emission     = Transaction Amount                              (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1 (gate: no mint without verdict)
  … process executes …
  BURN(amount)  ← cycle completion; net = 0 (I5)

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)               ← spec formula (I-RS-1/I-RS-2)
  internalPrice = base × reserveIndex                         ← rises as confirmed work accumulates
  AFC accruals  → NodeChain (audit trail only, not in formula)
```

Sources of authority (highest first): `docs/specs/AST_Emission_AGENT_EN.md`,
`docs/specs/AST_Reserve_AGENT_EN.md`, `reference/ast-core/src/emission.ts`,
`reference/ast-core/src/aroscoin.ts`. All agree with the production code.

---

## 3. Audit Result — Code Is Canonical

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✅ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✅ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✅ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` | ✅ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✅ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✅ Correct |
| Commission 75/25 distribution | 75% to nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✅ Correct |
| Commission paid post-factum | Distribution only at epoch finalization, gated by PoT | ✅ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch (I7) | ✅ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` per spec I-RS-1 | ✅ Correct |
| AFC accruals in NodeChain | Recorded as `reserve.afc.accrual` events (audit trail) | ✅ Correct |
| PoT gate | Binary verdict; gates all downstream value (I1/I2) | ✅ Correct |
| NodeChain | Append-only, hash-continuous, all significant events recorded | ✅ Correct (I3/I8) |
| Nodes | Work+reputation weight; no stake/slashing fields | ✅ Correct (I9) |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✅ Correct (I10) |

**No deviations found. No code corrections required.**

---

## 4. Canonical Flow Trace: $10,000 Transaction

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO  ← MINT (1:1, PoT-gated at verified === 1)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event
Burn          = 10,000 ARO  ← BURN (net circulating change = 0, I5)

supplyAfter   = earnedRetained  (process net = 0; totalSupply = earned only, I6)
reserveIndex  = log10(1 + 10,000) ≈ 4.0000  (grows with confirmed volume, I-RS-4)
internalPrice = base × 4.0000              (rises with each additional verified process)
```

---

## 5. Invariant Status

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on PoT verified === 1 | ✅ Pass |
| I2 | Every emission bound to a confirmed process | ✅ Pass |
| I3 | Every significant event in NodeChain | ✅ Pass |
| I4 | Deterministic: same input → same result | ✅ Pass |
| I5 | Process part nets to 0 (processMinted == processBurned) | ✅ Pass |
| I6 | `totalSupply = (minted−burned) + earnedRetained` | ✅ Pass |
| I7 | Commission pool reconciles: `paid + margin == fees` | ✅ Pass |
| I8 | NodeChain append-only and hash-continuous | ✅ Pass |
| I9 | Node influence from work+reputation, no stake field | ✅ Pass |
| I10 | All-Seeing Eye passive: signals only, no state change | ✅ Pass |
| I-RS-1 | reserveIndex grows only from confirmed volume | ✅ Pass |
| I-RS-2 | reserveIndex derivable from NodeChain, not set manually | ✅ Pass |
| I-RS-4 | Monotonic non-decreasing with volume | ✅ Pass |

---

## 6. Files Changed This Session

```
AGENT_CORE_REPORT.md    Updated for this audit session (2026-06-20, branch claude/inspiring-cannon-ghkvxa)
```

No production code changes were required — the implementation was found fully canonical.

---

## 7. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR #306 | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` formula aligned with spec: removed `totalAfcReserve` from formula |
| **This run** | `claude/inspiring-cannon-ghkvxa` | Full audit confirmed: all components canonical, no corrections needed |
