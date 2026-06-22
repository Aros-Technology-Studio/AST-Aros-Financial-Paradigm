# AGENT CORE REPORT — Canonical 1:1 Emission Model Audit

**Date:** 2026-06-22  
**Branch:** `agent/core-emission`  
**Agent:** AGENT-CORE  
**Task:** Audit and confirm/correct the ArosCoin emission implementation against the canonical Model-1 formula.

---

## Verdict: CONFORMS ✅

The production codebase **fully implements** the canonical 1:1 emission model as specified in `01_coin_engine/coin_emission_model.md`, `docs/specs/AST_Emission_AGENT_EN.md`, and the reference implementation at `reference/ast-core/src/emission.ts`.

No rewrites were required. This report documents the audit trace and the exact file/line locations for each canonical rule.

---

## 1. Canonical Model Checklist

### Rule 1 — Emission = Transaction Amount (1:1)

**Status:** ✅ Implemented  
**File:** `src/emission/emission.service.ts:111`

```typescript
const emission = txAmount;   // 1:1 — no multiplier
```

The `emit()` method at line 55 passes `amount` directly to `mint()`, which calls `coin.recordMint(amount)` — minting exactly the transaction amount. No scaling factor or multiplier is applied.

---

### Rule 2 — Commission = Transaction Amount × rate (default 0.5%)

**Status:** ✅ Implemented  
**File:** `src/commission/commission.service.ts:69,96`

```typescript
readonly feeRate = 0.005;    // canonical 0.5%

computeFee(amount: number, overloadRate = 0): number {
    const fee = amount * this.feeRate;
    return fee * (1 + overloadRate);
}
```

`$10,000` transaction → `fee = 10,000 × 0.005 = 50 ARO`.

---

### Rule 3 — 75% of commission to nodes, 25% to AFC Reserve

**Status:** ✅ Implemented  
**File:** `src/commission/commission.service.ts:72,138,148,161`

```typescript
readonly marginRate = 0.25;   // 25% to AFC Reserve; remaining 75% to nodes

// in finalizeEpoch():
const distributable = total * (1 - this.marginRate);  // 75% to nodes
// ...paid to nodes proportionally to PoT weight...
const allocatedMargin = total - paid;                  // 25% remainder → AFC
await this.reserve.addAfcAccrual(allocatedMargin);
```

The distribution is strictly post-factum and gated by PoT verdict `verified === 1`. Nodes with no confirmed participation receive no payment.

---

### Rule 4 — Process part burned after cycle completion

**Status:** ✅ Implemented  
**File:** `src/emission/emission.service.ts:55–63` and `src/orchestrator/orchestrator.service.ts:162–175`

```typescript
// emit() — both mint and burn happen within a single confirmed process:
const minted = await this.mint(processId, amount);
const burned = await this.burn(processId, minted);
return { authorized: true, minted, burned, processId };
```

Orchestrator canonical order (mirrors `reference/ast-core/src/orchestrator.ts`):

```
mint → commission.accrue → burn
```

After the cycle: `processMinted == processBurned` → `processNet = 0` → process part has zero net supply impact. `totalSupply` equals `earnedRetained` once all cycles complete (invariant I5/I6).

---

### Rule 5 — AFC Reserve grows → internal price of next emission rises

**Status:** ✅ Implemented  
**Files:** `src/reserve/reserve.service.ts:86–95`, `src/aroscoin/aroscoin.service.ts:104`

```typescript
// reserveIndex = log10(1 + totalProcessVolume)
async reserveIndex(): Promise<number> {
    const volume = await this.totalProcessVolume();  // sum of emission.minted events
    return log10(1 + volume);
}

// internalPrice = base * reserveIndex
internalPrice(reserveIndex: number): number {
    return this.base * reserveIndex;
}
```

`totalProcessVolume` is derived from `emission.minted` NodeChain events (only PoT-verified mints). More confirmed volume → higher `reserveIndex` → higher `internalPrice`. The index is monotonically non-decreasing (spec I-RS-4).

---

### Rule 6 — Emission gated on PoT verdict `verified === 1`

**Status:** ✅ Implemented  
**File:** `src/emission/emission.service.ts:56–58,72–74`

```typescript
// emit(): silent gate — returns authorized=false with no ledger change
const verdict = await this.pot.getVerdict(processId);
if (!verdict || verdict.verified !== 1) {
    return { authorized: false, minted: 0, burned: 0, processId };
}

// mint(): hard gate — throws for any direct call without verified=1
if (!verdict || verdict.verified !== 1) {
    throw new Error(`emission refused for ${processId}: no PoT confirmation (verified === 1 required)`);
}
```

---

### Rule 7 — All emission events recorded in NodeChain

**Status:** ✅ Implemented  
**File:** `src/emission/emission.service.ts:77,87`

```typescript
await this.chain.append('emission.minted', { processId, minted: amount });
// ...
await this.chain.append('emission.burned', { processId, burned: amount });
```

Every mint and burn is traceable in the append-only NodeChain. The Reserve service reads `emission.minted` events to derive `totalProcessVolume`.

---

## 2. Supply Identity

```
totalSupply = (processMinted − processBurned) + earnedRetained
```

**File:** `src/aroscoin/aroscoin.service.ts:86–89`

After a completed cycle: `processMinted == processBurned` → `processNet = 0` → `totalSupply = earnedRetained`.

Supply is **derived**, never assigned. The ledger holds three running tallies in a single row (`ArosCoinLedger`, id=1); `totalSupply` is computed on every read.

---

## 3. Canonical Formula — Pure Calculation

**File:** `src/emission/emission.service.ts:107–120`

```typescript
calculate(txAmount: number, commissionRate = 0.005) {
    const emission   = txAmount;                     // 1:1
    const commission = txAmount * commissionRate;    // 0.5% default
    return {
        emission,
        commission,
        nodeShare: commission * 0.75,                // 75% → nodes by PoT weight
        afcShare:  commission * 0.25,                // 25% → AFC reserve
        net: 0,                                      // mint then burn; cycle is symmetric
    };
}
```

**Reference example (`$10,000` transaction):**

| Field        | Value       |
|--------------|-------------|
| `emission`   | 10,000 ARO  |
| `commission` | 50 ARO      |
| `nodeShare`  | 37.50 ARO   |
| `afcShare`   | 12.50 ARO   |
| `net`        | 0 ARO       |

---

## 4. Prohibited Constructs — Grep Audit

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| P1 — staking / stakedBalance / stake_freeze | **ABSENT** | No `stake` field in `nodes.entity.ts`; `NodesService` uses `reputation` + `weight` |
| P2 — slashing against balance | **ABSENT** | No slash logic in `nodes.service.ts` |
| P3 — token-weighted governance | **ABSENT** | No vote-by-balance in commission or release |
| P4 — farming / passive yield for holding | **ABSENT** | No auto-mint; earned value derives from confirmed work only |
| P5 — mint-on-deposit / crypto→ArosCoin | **ABSENT** | No deposit path in any service; `09_crypto_ingestion_pipeline/` is historical Model-A docs only |
| P6 — AllSeeingEye state change | **ABSENT** | Eye exposes only `log()` and `compareSupply()` — no `enforce()` / `halt()` / `setState()` |
| P7 — emission outside confirmed-process | **ABSENT** | `emit()` and `mint()` both check `verdict.verified === 1` before any ledger write |

---

## 5. Module 01_coin_engine Status

`01_coin_engine/` contains **specification and protocol documents**, not runnable code. It is not deprecated — it is the canonical protocol definition layer. The production NestJS module implementing it is `src/emission/`.

The mapping is:

| Doc layer | Implementation layer |
|-----------|----------------------|
| `01_coin_engine/coin_emission_model.md` | `src/emission/emission.service.ts` |
| `01_coin_engine/aro_emission_protocol.md` | `src/emission/emission.service.ts` + `src/orchestrator/orchestrator.service.ts` |
| `01_coin_engine/burn_and_mint_rules.md` | `src/emission/emission.service.ts:55–89` |
| `reference/ast-core/src/emission.ts` | `src/emission/emission.service.ts` (mirrors exactly) |

---

## 6. Full Lifecycle Flow (Confirmed)

```
Transaction Request (amount = A)
         │
         ▼
[1] StateRecording.capture('initiation', { amount: A })
         │
         ▼
[2] Admissibility check → reject if inadmissible (no value produced)
         │ (admissible only)
         ▼
[3] Node assignment → register nodes, record 'task_assignment'
         │
         ▼
[4] Execution → 'stage_transition', 'execution_complete'; nodes.recordExecution()
         │
         ▼
[5] PoT.verify(processId) → verdict ∈ {0, 1}
         │
         ├─ verified = 0 → record 'final_status: rejected', return (no value)
         │
         └─ verified = 1 ─────────────────────────────────────────────────────┐
                                                                               │
[6] Emission.mint(processId, A)    ← PoT gate confirmed (P7/I1)               │
    coin.processMinted += A                                                    │
    chain.append('emission.minted', { processId, minted: A })                 │
         │                                                                     │
[7] Commission.accrue(epoch, fee = A × 0.005, participants)                   │
    fee = 50 ARO (for A = 10,000)                                             │
    epoch pool grows                                                           │
         │                                                                     │
[8] Emission.burn(processId, A)                                               │
    coin.processBurned += A  →  processNet = 0                                │
    chain.append('emission.burned', { processId, burned: A })                 │
         │                                                                     │
[9] Reserve.reserveIndex() = log10(1 + Σ emission.minted)  →  grows          │
         │                                                                     │
[10] StateRecording.capture('final_status: done')                             │
     AllSeeingEye.compareSupply()  ← passive observation only (P6/I10)       │
         │                                                                     │
     Return: { verified:1, minted:A, fee:50, supplyAfter, reserveIndex }

─── On epoch finalization ────────────────────────────────────────────────────
Commission.finalizeEpoch(epoch):
    distributable = totalFees × 0.75          → paid to nodes by PoT weight
    allocatedMargin = totalFees × 0.25        → AFC Reserve audit accrual
    Σ(payments) + allocatedMargin == totalFees  (I7 reconciliation)
```

---

## 7. Invariants Verified

| ID | Rule | File:Line |
|----|------|-----------|
| I1 | Value exists only when `verified === 1` | `emission.service.ts:56–58` |
| I2 | Every emission bound to confirmed process | `emission.service.ts:72–74` throws if unverified |
| I3 | Every significant event in NodeChain | `emission.service.ts:77,87`; orchestrator records all stages |
| I4 | Deterministic: same input → same result | `ClockService` deterministic ticks; sorted node ids in commission |
| I5 | Process part nets to 0 | `aroscoin.service.ts:92–95` `processNet()` |
| I6 | `totalSupply = earnedRetained` after burns | `aroscoin.service.ts:86–89` |
| I7 | Commission reconciles: `Σ(payments) + margin == Σ(fees)` | `commission.service.ts:174` with `RECONCILE_EPSILON=1e-9` |

---

## 8. Files Audited

| File | Role |
|------|------|
| `src/emission/emission.service.ts` | PoT-gated emit/mint/burn + canonical `calculate()` |
| `src/emission/emission.service.spec.ts` | Tests I1/I5/I6, I2/P7, I4, canonical formula |
| `src/aroscoin/aroscoin.service.ts` | Unit ledger: three tallies + derived `totalSupply` |
| `src/commission/commission.service.ts` | Fee computation + 75/25 epoch settlement |
| `src/reserve/reserve.service.ts` | `reserveIndex = log10(1 + volume)` from NodeChain history |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle: mint → accrue → burn (canonical order) |
| `reference/ast-core/src/emission.ts` | Behavioral authority (19-line reference) |
| `01_coin_engine/coin_emission_model.md` | Canonical protocol spec |
| `docs/specs/AST_Emission_AGENT_EN.md` | Machine-readable agent spec |

---

*Report generated by AGENT-CORE on 2026-06-22. No code changes were required — the canonical model was already fully implemented.*
