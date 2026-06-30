# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-116xt4`  
**Date:** 2026-06-30  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or correct deviations.

---

## 1. Directories Examined

| Path | Content | Status |
|------|---------|--------|
| `01_coin_engine/` | Economic specifications (coin_emission_model.md, burn_and_mint_rules.md, etc.) | Documentation only — canonical formulas confirmed |
| `10_proof_of_transaction_engine/` | PoT documentation | Documentation only — no emission formulas |
| `src/token/` | Does not exist | Expected — token ledger lives in `src/aroscoin/` |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/emission/emission.service.spec.ts` | 9 emission tests | All pass ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Cross-checked ✓ |
| `reference/ast-core/src/aroscoin.ts` | Reference implementation | Cross-checked ✓ |

---

## 2. Canonical Model (source of truth)

From `01_coin_engine/coin_emission_model.md` and `docs/specs/AST_Emission_AGENT_EN.md`:

```
Emission     = Transaction Amount                              (1:1, no multiplier)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → processing nodes by PoT weight)
  AFC Share  = C × 0.25                                       (25% → AFC reserve)

ARO lifecycle per confirmed process:
  MINT(amount)   ← PoT verdict verified === 1
  ... process executes ...
  BURN(amount)   ← cycle completion; net circulating change = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              (spec I-RS-1/I-RS-2)
  internalPrice  = base × reserveIndex
```

**Reference example from spec ($10,000 transaction):**

| Field | Value |
|-------|-------|
| TX Amount | 10,000 ARO |
| Emission (minted) | 10,000 ARO |
| Commission (0.5%) | 50 ARO |
| Node pool (75%) | 37.50 ARO |
| AFC reserve (25%) | 12.50 ARO |
| Burn | 10,000 ARO |
| Net circulating Δ | 0 |

---

## 3. Audit: src/emission/emission.service.ts

### 3.1 calculate() — pure canonical formula

```typescript
calculate(txAmount: number, commissionRate = 0.005): {
    emission: number;     // = txAmount (1:1)
    commission: number;   // = txAmount × commissionRate
    nodeShare: number;    // = commission × 0.75
    afcShare: number;     // = commission × 0.25
    net: number;          // = 0 always
}
```

**Verdict: CANONICAL ✓** — Formula is exact. No side effects on ledger.

### 3.2 emit() — PoT-gated full lifecycle

```typescript
async emit(processId: string, amount: number): Promise<EmitResult>
```

- Reads PoT verdict; returns `{ authorized: false, minted: 0, burned: 0 }` if not `verified === 1`.
- On authorization: calls `mint()` then `burn()`.
- Both events recorded in NodeChain (`emission.minted`, `emission.burned`).

**Verdict: CANONICAL ✓** — PoT gate is mandatory; no mint without confirmed verdict.

### 3.3 mint() / burn() — ledger operations

- `mint()`: checks verdict again (`verified === 1`), calls `coin.recordMint(amount)`, appends `emission.minted` to NodeChain.
- `burn()`: calls `coin.recordBurn(amount)`, appends `emission.burned` to NodeChain.

**Verdict: CANONICAL ✓** — Mirrors `reference/ast-core/src/emission.ts` exactly.

---

## 4. Audit: src/aroscoin/aroscoin.service.ts

```
Supply identity (I-AC-5):
  totalSupply = (processMinted - processBurned) + earnedRetained

After completed cycles:
  processNet = processMinted - processBurned = 0
  totalSupply = earnedRetained
```

Three persisted tallies in `ArosCoinLedger`: `processMinted`, `processBurned`, `earnedRetained`.  
No mint-on-deposit, no free emission, no custody bridge.

**Verdict: CANONICAL ✓**

---

## 5. Audit: src/commission/commission.service.ts

```
feeRate   = 0.005   (0.5%)
marginRate = 0.25   (25% to AFC, 75% to nodes)

finalizeEpoch():
  distributable = totalFees × 0.75  → paid to nodes by PoT-confirmed weight
  allocatedMargin = totalFees - paid → 25% to ReserveService.addAfcAccrual()
  reconciled: |paid + allocatedMargin - totalFees| < 1e-9
```

Payment is strictly post-factum; only PoT-confirmed participations (`verified === 1`) count toward node weight. Distribution is deterministic (nodes sorted before iteration). Pool reconciles to zero remainder (I7).

**Verdict: CANONICAL ✓**

---

## 6. Audit: src/reserve/reserve.service.ts

```
reserveIndex = log10(1 + totalProcessVolume)

totalProcessVolume = Σ(emission.minted payloads) + Σ(commission.epoch.finalized operationalMargin)
```

Recomputed from NodeChain history on every read (I-RS-2). Monotonically non-decreasing (I-RS-4). AFC accruals tracked separately as `reserve.afc.accrual` events for audit; they do enter `totalProcessVolume` via the `commission.epoch.finalized` signal.

**Verdict: CANONICAL ✓**

---

## 7. Test Results

```
PASS src/emission/emission.service.spec.ts

  EmissionService
    ✓ I1/I5/I6: emit on a verified process nets the process part to 0        (94ms)
    ✓ I1/I2/P7: emit on an unverified process mints nothing                  (21ms)
    ✓ P7: emit on a verified:0 process mints nothing                         (27ms)
    ✓ I2: mint() throws for an unverified process                            (19ms)
    ✓ records emission.minted and emission.burned in NodeChain               (36ms)
    ✓ I4: identical verified emissions yield identical supply outcomes        (47ms)
    calculate() — pure canonical formula (no side effects)
      ✓ returns canonical breakdown for the $10,000 reference example        (11ms)
      ✓ accepts a custom commission rate                                      (11ms)
      ✓ has no side effects on the coin ledger                               (18ms)

Tests: 9 passed, 9 total
```

The $10,000 reference example test (`calculate(10_000)`) asserts:
- `emission === 10_000`
- `commission ≈ 50`
- `nodeShare ≈ 37.5`
- `afcShare ≈ 12.5`
- `nodeShare + afcShare === commission` (no remainder)
- `net === 0`

All assertions pass. ✓

---

## 8. Prohibited Constructs — Not Present

| Prohibited construct | Status |
|---------------------|--------|
| Staking / stakedBalance | Absent ✓ |
| Slashing against balance | Absent ✓ |
| Token-weighted governance | Absent ✓ |
| Farming / yield accrual | Absent ✓ |
| mint-on-deposit / crypto→ARO bridge | Absent ✓ |
| All-Seeing Eye mutating state | Absent ✓ |
| Emission without PoT `verified === 1` | Impossible by code path ✓ |

---

## 9. Summary

**The production implementation in `src/emission/` fully conforms to the canonical 1:1 emission model.** No corrections were required. The code:

1. Emits 1:1 (`emission = txAmount`).
2. Computes commission at 0.5% with a 75/25 node/AFC split.
3. Mints and burns the process part within each confirmed cycle (net = 0).
4. Gates all emission on PoT verdict `verified === 1`.
5. Records every event in NodeChain for audit trail.
6. Passes all 9 automated invariant tests.

`src/token/` does not exist — this is correct. Token logic lives in `src/aroscoin/` (the unit ledger) and `src/emission/` (the minter), as per the Model-1 spec.

Module `01_coin_engine` is documentation, not deprecated NestJS code. Its canonical formulas match the production implementation exactly.
