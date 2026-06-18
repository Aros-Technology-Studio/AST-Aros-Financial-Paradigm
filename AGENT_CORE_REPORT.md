# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission` (this run)  
**Date:** 2026-06-18  
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Status |
|------|---------|--------|
| `01_coin_engine/` | Canonical spec docs (aro_emission_protocol.md, coin_emission_model.md, etc.) | Active spec — NOT deprecated |
| `10_proof_of_transaction_engine/` | PoT engine specs (9 files) | Active spec |
| `src/token/` | Old Model-A emission path | **Does not exist** — correctly absent |
| `src/emission/emission.service.ts` | NestJS EmissionService | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Previously corrected ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | **Corrected this run** |
| `reference/ast-core/src/emission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/commission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Audited |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`01_coin_engine/` is documentation, not deprecated code. The production implementation lives
in `src/emission/` and related NestJS modules. The `src/token/` Model-A path does not exist.

---

## 2. Canonical Model

```
Emission     = Transaction Amount                          (1:1)
Commission C = Transaction Amount × feeRate                (default 0.5%)
  Node Share = C × 0.75                                   (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                   (25% → Reserve AFC accrual)

ARO lifecycle:
  MINT(amount)  ← PoT verified === 1
  … process executes …
  BURN(amount)  ← cycle completion; net = 0

reserveIndex   = log10(1 + totalProcessVolume)             (spec: docs/specs/AST_Reserve_AGENT_EN.md)
internalPrice  = base × reserveIndex                       (grows with confirmed process volume)
```

Sources: `docs/specs/AST_*_AGENT_EN.md` (highest authority) > `reference/ast-core/` (second).

---

## 3. Conformant — No Changes Needed

| Component | Canonical Requirement | Verdict |
|-----------|----------------------|---------|
| `EmissionService.emit()` | Mint = amount (1:1), PoT-gated | ✓ Correct |
| `EmissionService.mint()` | Throws if `verified !== 1` | ✓ Correct |
| `EmissionService.burn()` | Burns exactly `minted`; process net → 0 | ✓ Correct |
| `ArosCoinService.totalSupply()` | `(processMinted − processBurned) + earnedRetained` | ✓ Correct |
| `CommissionService.feeRate` | 0.5% default | ✓ Correct (0.005) |
| `CommissionService.marginRate` | 25% to AFC / 75% to nodes | ✓ Correct (0.25) |
| AFC routing | `reserve.addAfcAccrual()` on epoch finalize | ✓ Correct |
| All-Seeing Eye | Passive: observe, log, signal; no state mutations | ✓ Correct |
| NodeChain | Append-only, hash-continuous | ✓ Correct |
| Nodes service | Work+reputation weight; no stake/slashing | ✓ Correct |
| PoT | Idempotent verify; binary verdict; gates all downstream value | ✓ Correct |

---

## 4. Deviation Found and Corrected (This Run)

### 4.1 ReserveService — reserveIndex Formula

**File:** `src/reserve/reserve.service.ts`

**Authority comparison:**

| Source | Formula | Authority Level |
|--------|---------|-----------------|
| `docs/specs/AST_Reserve_AGENT_EN.md` | `log10(1 + totalProcessVolume)` | Highest |
| `reference/ast-core/src/reserve.ts` | `log10(1 + totalProcessVolume)` | Second |
| `src/reserve/reserve.service.ts` (before fix) | `log10(1 + totalProcessVolume + totalAfcReserve)` | Deviated |

The previous implementation extended the formula to include `totalAfcReserve`, intending to
make the reserve index respond to AFC accruals from Commission epoch finalization. However,
both top-authority sources agree on `log10(1 + totalProcessVolume)` without the AFC component.
The Reserve spec invariant I-RS-4 explicitly ties monotonicity to `totalProcessVolume` only.

**Fix applied:**
```typescript
// Before:
async reserveIndex(): Promise<number> {
    const [volume, afcReserve] = await Promise.all([
        this.totalProcessVolume(),
        this.totalAfcReserve(),
    ]);
    return log10(1 + volume + afcReserve);
}

// After (aligned with docs/specs/AST_Reserve_AGENT_EN.md and reference):
async reserveIndex(): Promise<number> {
    const volume = await this.totalProcessVolume();
    return log10(1 + volume);
}
```

AFC accrual tracking (`addAfcAccrual()`, `totalAfcReserve()`) is retained for audit and
accounting purposes — the `reserve.afc.accrual` NodeChain events are still recorded on every
epoch finalization. Only the `reserveIndex()` formula is corrected.

---

## 5. Invariant Status (Post All Corrections)

| ID | Rule | Status |
|----|------|--------|
| I1 | Value only on verified === 1 | ✓ |
| I2 | Every emission bound to confirmed process | ✓ |
| I3 | All significant events in NodeChain (incl. AFC accruals) | ✓ |
| I4 | Deterministic: same input → same result | ✓ |
| I5 | Process part nets to 0 (mint = burn within same process) | ✓ |
| I6 | `totalSupply = earnedRetained` after burns | ✓ (AFC in reserve, not earned) |
| I7 | Pool reconciles: `paid + margin == fees` | ✓ |
| I8 | NodeChain append-only + hash-continuous | ✓ |
| I9 | Node influence from work+reputation, no stake field | ✓ |
| I10 | Eye passive: no state change on observe | ✓ |

---

## 6. Transaction Example: $10,000

```
TX Amount     = 10,000 ARO
Emission      = 10,000 ARO   ← MINT (1:1, PoT-gated)
Commission    = 10,000 × 0.005 = 50 ARO
  Node Share  = 50 × 0.75 = 37.50 ARO  → coin.recordEarned (post-factum, epoch finalization)
  AFC Reserve = 50 × 0.25 = 12.50 ARO  → reserve.addAfcAccrual → NodeChain
Burn          = 10,000 ARO   ← BURN (net circulating change = 0)

reserveIndex  = log10(1 + 10,000) ≈ 4.0000   ← grows with each confirmed process
internalPrice = base × 4.0000 → rises → next emission more valuable
```

---

## 7. Files Changed (This Run)

```
src/reserve/reserve.service.ts    reserveIndex() corrected: log10(1+volume+afc) → log10(1+volume)
                                  docstring updated to reflect authoritative spec formula
AGENT_CORE_REPORT.md              Updated with this run's findings
```

---

## 8. Audit Trail

| Session | Branch | Action |
|---------|--------|--------|
| PR #72 | `agent/core-emission` (original) | First canonical 1:1 emission implementation |
| PR #289 | `claude/ast-model1-rewrite` | Full NestJS Model-1 rewrite (all 11 modules) |
| PR #296 | `claude/inspiring-cannon-9niouj` | Invariants + CI; code confirmed canonical |
| Previous run | `claude/inspiring-cannon-wdv1j3` | Commission 75/25, 0.5% rate, AFC routing corrected |
| **This run** | `agent/core-emission` | reserveIndex formula corrected to match authoritative spec |
