# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-eywjkj`
**Date:** 2026-06-19
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation (aro_emission_protocol.md, coin_emission_model.md, etc.) | Historical Model-A docs; not executable |
| `10_proof_of_transaction_engine/` | PoT documentation | Historical; no emission formulas |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Docstring corrected** |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Confirmed formula source |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Definitive on formula |

`src/token/` does not exist — there is no legacy `token/` module. Production emission logic
lives in `src/emission/`, `src/aroscoin/`, `src/commission/`, and `src/reserve/`.

`01_coin_engine/` is documentation-only (Model-A historical). No executable code resides there.

---

## 2. Canonical Model (verified against spec)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75        (75% → nodes, post-factum by PoT work weight)
  AFC Share  = C × 0.25        (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; processNet = 0

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)    ← confirmed volume only (spec I-RS-1)
  internalPrice = base × reserveIndex              ← rises as confirmed work accumulates
  AFC accruals  → NodeChain (audit trail); not part of the index formula
```

Sources of authority: `docs/specs/AST_Reserve_AGENT_EN.md`, `reference/ast-core/src/reserve.ts`.
Both agree unambiguously on the formula.

---

## 3. Production Code Conforms — All Invariants Pass

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; processNet → 0 (I5) | ✓ Correct |
| `ArosCoinService` three-tally ledger | `totalSupply = (processMinted − processBurned) + earnedRetained` (I6) | ✓ Correct |
| `CommissionService.feeRate` | 0.005 (0.5%) | ✓ Correct |
| `CommissionService.marginRate` | 0.25 (25% → AFC) | ✓ Correct |
| Commission 75/25 distribution | 75% nodes via `coin.recordEarned`, 25% via `reserve.addAfcAccrual` | ✓ Correct |
| Commission pool reconciliation | `paid + margin == total` per epoch; epsilon 1e-9 (I7) | ✓ Correct |
| `ReserveService.reserveIndex()` | `log10(1 + totalProcessVolume)` — confirmed volume only | ✓ Correct |
| PoT gate | Idempotent verify; binary verdict; gates all downstream value (I1/I2) | ✓ Correct |
| NodeChain | Append-only, hash-continuous (I8) | ✓ Correct |
| Nodes | Work+reputation weight; no stake/slashing fields (I9/P1/P2) | ✓ Correct |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations (I10/P6) | ✓ Correct |
| No prohibited constructs | No staking/slashing/farming/governance/deposit-mint | ✓ Confirmed (P1–P7) |

---

## 4. Change Made This Session

### 4.1 ReserveService — Class-Level Docstring Correction

**File:** `src/reserve/reserve.service.ts`

The `reserveIndex()` method implementation was already spec-correct:
```typescript
async reserveIndex(): Promise<number> {
    const volume = await this.totalProcessVolume();
    return log10(1 + volume);   // ← correct
}
```

However, the class-level JSDoc block (lines 12–16) still referenced the old deviated formula
`log10(1 + totalProcessVolume + totalAfcReserve)` — a formula that was previously corrected in
the implementation but whose docstring was not updated.

**Before:**
```
* single `reserveIndex`. That index is AST's own capitalization measure: it grows with the
* aggregate volume of PoT-verified processes AND with the AFC share of every epoch's commission
* pool, and underpins internal valuation and Release readiness. It mirrors
* `reference/ast-core/src/reserve.ts` and the canonical formula
* `reserveIndex = log10(1 + totalProcessVolume + totalAfcReserve)`.
```

**After:**
```
* single `reserveIndex`. That index is AST's own capitalization measure: it grows with the
* aggregate volume of PoT-verified processes and underpins internal valuation and Release
* readiness. It mirrors `reference/ast-core/src/reserve.ts` and the canonical formula
* `reserveIndex = log10(1 + totalProcessVolume)` (spec I-RS-1: confirmed volume only).
```

The incorrect formula in the docstring contradicted:
- Spec `docs/specs/AST_Reserve_AGENT_EN.md` (I-RS-1: "grows only from confirmed volume")
- Reference `reference/ast-core/src/reserve.ts` (unambiguously uses `totalProcessVolume` only)
- The implementation on line 94 (already correct)

---

## 5. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain event
Burn          = 10,000 ARO   ← BURN (processNet = 0; I5)

totalSupply after cycle:  0 + earnedRetained  (process part nets to 0; I6)
reserveIndex (after process):  log10(1 + 10_000) ≈ 4.0000
internalPrice = base × 4.0000  → rises with each additional confirmed process
```

---

## 6. Invariant Impact

All 10 project invariants (I1–I10) remain unaffected. The docstring change is non-executable.
The `reserveIndex()` formula itself was already correct.

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on PoT verified === 1 | ✓ Unaffected |
| I2 | Every emission bound to confirmed process | ✓ Unaffected |
| I3 | All significant events in NodeChain | ✓ AFC accrual still recorded |
| I4 | Deterministic: same input → same result | ✓ Unaffected |
| I5 | Process part nets to 0 | ✓ Unaffected |
| I6 | `totalSupply` derivable from history | ✓ Unaffected |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ Unaffected |
| I8 | NodeChain append-only | ✓ Unaffected |
| I9 | Node influence from work+reputation | ✓ Unaffected |
| I10 | Eye passive: no state change | ✓ Unaffected |
| I-RS-1 | Index grows from confirmed volume only | ✓ Docstring now matches implementation |
| I-RS-2 | Derivable from NodeChain | ✓ Unaffected |
| I-RS-4 | Monotonic non-decreasing | ✓ Unaffected |

---

## 7. Files Changed

```
src/reserve/reserve.service.ts    Class-level docstring corrected:
                                  Removed incorrect formula `log10(1 + totalProcessVolume + totalAfcReserve)`;
                                  aligned with spec: `log10(1 + totalProcessVolume)` only.

AGENT_CORE_REPORT.md              This report.
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| PR #298 | `claude/inspiring-cannon-wdv1j3` | Commission 75/25 + AFC reserve routing corrected |
| PR prev | `claude/inspiring-cannon-4m9xnj` | `reserveIndex()` implementation aligned with spec (removed `totalAfcReserve` from formula body) |
| **This run** | `claude/inspiring-cannon-eywjkj` | `ReserveService` class docstring aligned with spec: formula comment corrected to `log10(1 + totalProcessVolume)` |
