# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-6m5o4e`
**Date:** 2026-06-29
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Status |
|------|---------|--------|
| `01_coin_engine/` | Documentation: `coin_emission_model.md`, `aro_emission_protocol.md`, burn/mint rules, etc. | Historical docs — not production code; rates cross-checked against impl |
| `10_proof_of_transaction_engine/` | PoT documentation (challenge/response, weighting, incentives) | No emission formulas — docs only |
| `src/token/` | Does not exist | — |
| `src/emission/emission.service.ts` | NestJS EmissionService — **production code** | Audited ✓ CONFORMANT |
| `src/emission/emission.service.spec.ts` | EmissionService tests | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ CONFORMANT |
| `src/commission/commission.service.ts` | NestJS CommissionService (75/25 split) | Audited ✓ CONFORMANT |
| `src/reserve/reserve.service.ts` | NestJS ReserveService (reserveIndex) | Audited ✓ CONFORMANT |
| `src/invariants/invariants.spec.ts` | Full Model-1 invariants suite (I1–I10) | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Read — NestJS impl mirrors it |
| `reference/ast-core/src/aroscoin.ts` | Reference implementation | Read — NestJS impl mirrors it |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Consulted |

**Key finding:** `01_coin_engine/` is a documentation folder, not a deprecated code module.
Production emission code lives in `src/emission/` and associated NestJS modules.
`src/token/` does not exist. All emission logic is correctly located in `src/emission/`,
`src/aroscoin/`, `src/commission/`, `src/reserve/`.

---

## 2. Canonical Model (verified against `coin_emission_model.md` and `docs/specs/`)

```
Emission     = Transaction Amount                               (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                     (default 0.5%)
  Node Share = C × 0.75                                        (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                        (25% → Reserve AFC, recorded in NodeChain)

ARO lifecycle per confirmed process:
  MINT(amount)   ← PoT verified === 1
  … process executes …
  BURN(amount)   ← cycle completion; net = 0

Reserve:
  reserveIndex  = log10(1 + totalProcessVolume)                (spec I-RS-1/I-RS-2; confirmed volume only)
  internalPrice = base × reserveIndex                          (rises as confirmed work accumulates)
```

### Reference example ($10,000 transaction)

```
TX Amount    = 10,000 ARO
Emission     = 10,000 ARO  (minted, 1:1)
Commission   = 10,000 × 0.005 = 50 ARO
  Node pool  = 50 × 0.75  = 37.50 ARO  (by PoT weight)
  AFC reserve= 50 × 0.25  = 12.50 ARO  (to Reserve layer)
Burn         = 10,000 ARO  (after cycle completes)
Net change   = 0
```

---

## 3. Audit Results — Point by Point

### 3.1 Emission = Transaction Amount (1:1)

**`src/emission/emission.service.ts` — `calculate()`**

```typescript
calculate(txAmount: number, commissionRate = 0.005) {
    const emission = txAmount;          // 1:1 — no multiplier
    const commission = txAmount * commissionRate;
    return {
        emission,
        commission,
        nodeShare: commission * 0.75,
        afcShare:  commission * 0.25,
        net: 0,
    };
}
```

**Verdict: CONFORMANT.** `emission = txAmount` exactly. No multiplier. Net = 0.

---

### 3.2 PoT Gate — Mint only on `verified === 1`

**`src/emission/emission.service.ts` — `emit()` and `mint()`**

```typescript
async emit(processId: string, amount: number): Promise<EmitResult> {
    const verdict = await this.pot.getVerdict(processId);
    if (!verdict || verdict.verified !== 1) {
        return { authorized: false, minted: 0, burned: 0, processId };
    }
    const minted = await this.mint(processId, amount);
    const burned = await this.burn(processId, minted);
    return { authorized: true, minted, burned, processId };
}
```

**Verdict: CONFORMANT.** No PoT verdict → no mint. `verified !== 1` → no mint.
Mirrors `reference/ast-core/src/emission.ts` exactly.

---

### 3.3 Burn on Cycle Completion (net = 0)

**`src/emission/emission.service.ts` — `burn()`**

```typescript
async burn(processId: string, amount: number): Promise<number> {
    await this.coin.recordBurn(amount);
    await this.chain.append('emission.burned', { processId, burned: amount });
    return amount;
}
```

`emit()` always calls `burn(minted)` immediately after `mint()` within the same confirmed cycle.
`processNet = processMinted − processBurned → 0` once cycle completes (spec I-EM-3, I5).

**Verdict: CONFORMANT.**

---

### 3.4 Commission Split — 75% Nodes / 25% AFC Reserve

**`src/commission/commission.service.ts` — `finalizeEpoch()`**

```typescript
readonly feeRate    = 0.005;   // 0.5%
readonly marginRate = 0.25;    // 25% → AFC reserve

const distributable = total * (1 - this.marginRate);  // 75% to nodes
// …nodes paid proportionally by PoT weight…
const allocatedMargin = total - paid;                   // exact 25% remainder
await this.reserve.addAfcAccrual(allocatedMargin);
```

Payment is **post-factum** by PoT-confirmed participation weight only (spec I-CM-1/I-CM-2).
Reconciliation: `Σ(payments) + allocatedMargin == totalFees` within 1e-9 (spec I-CM-4, I7).

**Verdict: CONFORMANT.**

---

### 3.5 Reserve Index Growth

**`src/reserve/reserve.service.ts` — `reserveIndex()`**

```typescript
async reserveIndex(): Promise<number> {
    const volume = await this.totalProcessVolume();
    return log10(1 + volume);
}
```

`totalProcessVolume` sums two PoT-gated signals from NodeChain:
- `emission.minted` events (process part minted per confirmed process)
- `commission.epoch.finalized` `operationalMargin` (AFC share per epoch)

Both are produced only behind the PoT gate → index grows from confirmed work only (I-RS-1).
Recomputed from history on each call (I-RS-2). Monotonically non-decreasing (I-RS-4).

**Verdict: CONFORMANT.** AFC accruals are also tracked separately as `reserve.afc.accrual`
events for audit queries without entering the index formula (spec I-RS-1).

---

### 3.6 ArosCoin Ledger — Three-Tally Supply Identity

**`src/aroscoin/aroscoin.service.ts`**

```typescript
// totalSupply = (processMinted − processBurned) + earnedRetained   (spec I-AC-5, I6)
async totalSupply(): Promise<number> {
    const row = await this.ledger();
    return (row.processMinted - row.processBurned) + row.earnedRetained;
}
```

- `processMinted` / `processBurned` track the transient process part (→ 0 after cycle).
- `earnedRetained` accumulates commission payments to nodes (remains after cycles complete).
- `totalSupply` is **derived**, never assigned.

**Verdict: CONFORMANT.**

---

### 3.7 Prohibited Constructs Check

| Prohibited (AST_RULES.yaml) | Present in `src/`? |
|-----------------------------|--------------------|
| Validator staking / stake freeze / slashing vs balance | Not found |
| Staking governance interface | Not found |
| `crypto_to_aroscoin_conversion` / mint-on-deposit bridge | Not found |
| Token-weighted voting | Not found |
| All-Seeing Eye writing state / enforcing / halting | Not found (eye is passive: observe → log → compare → signal) |

**Verdict: No prohibited constructs detected.**

---

## 4. Test Coverage Summary

| Test file | Invariants covered |
|-----------|-------------------|
| `src/emission/emission.service.spec.ts` | I1 (PoT gate), I2 (no unauthorized mint), I4 (determinism), I5 (processNet→0), I6 (supply identity), P7 (unverified=0 blocked) |
| `src/invariants/invariants.spec.ts` | Full I1–I10 suite via `OrchestratorService` on real in-memory SQLite |

The `calculate()` test in `emission.service.spec.ts` explicitly asserts the `$10,000 → 10,000 ARO`
reference example from `coin_emission_model.md`:

```
emission   = 10,000 ARO    ✓
commission =     50 ARO    ✓
nodeShare  =   37.5 ARO    ✓
afcShare   =   12.5 ARO    ✓
net        =      0        ✓
```

---

## 5. Conclusion

**The production code fully implements the canonical 1:1 emission model.**

No deviations from the canonical model were found. Specifically:

- Emission is exactly `txAmount` (1:1, no multiplier).
- PoT gate is mandatory: emission is refused for any process without `verified === 1`.
- Every minted process part is burned on cycle completion; `processNet → 0`.
- Commission = `txAmount × 0.005`; split 75% nodes / 25% AFC — post-factum, by PoT weight.
- `reserveIndex = log10(1 + totalProcessVolume)` derived from confirmed-work NodeChain history.
- `totalSupply = (processMinted − processBurned) + earnedRetained` — derived, never assigned.
- No prohibited constructs (staking, slashing, mint-on-deposit, token-weighted voting) are present.

No code changes were required. The audit confirms the implementation is correct and complete.

---

## 6. Source Locations

| Concern | File |
|---------|------|
| Emission lifecycle (mint / burn / PoT gate) | `src/emission/emission.service.ts` |
| Canonical formula (pure, no side effects) | `src/emission/emission.service.ts:calculate()` |
| Unit ledger (three tallies, supply identity) | `src/aroscoin/aroscoin.service.ts` |
| Commission split (75/25, post-factum) | `src/commission/commission.service.ts:finalizeEpoch()` |
| Reserve index (log growth from confirmed volume) | `src/reserve/reserve.service.ts:reserveIndex()` |
| Emission tests | `src/emission/emission.service.spec.ts` |
| Full invariants suite (I1–I10) | `src/invariants/invariants.spec.ts` |
| Reference implementation | `reference/ast-core/src/emission.ts`, `aroscoin.ts` |
| Canonical model documentation | `01_coin_engine/coin_emission_model.md` |
