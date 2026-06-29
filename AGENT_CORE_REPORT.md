# AGENT_CORE_REPORT — Canonical 1:1 Emission Model Audit

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-tuejo5`
**Date:** 2026-06-29
**Task:** Audit ArosCoin emission logic against the canonical model; correct deviations.

---

## 1. Directories Examined

| Path | Content | Authority |
|------|---------|-----------|
| `01_coin_engine/` | Documentation: `aro_emission_protocol.md`, `coin_emission_model.md`, `burn_and_mint_rules.md`, etc. | Canonical spec docs; no production code |
| `10_proof_of_transaction_engine/` | PoT documentation: `pot_engine_overview.md`, `pot_tx_validation_logic.md`, etc. | Canonical spec docs; no emission formulas |
| `src/token/` | Does not exist | — |
| `src/emission/emission.service.ts` | NestJS EmissionService — production code | Audited ✓ |
| `src/emission/emission.service.spec.ts` | Jest tests for EmissionService | Audited ✓ |
| `src/aroscoin/aroscoin.service.ts` | NestJS ArosCoinService (unit ledger) | Audited ✓ |
| `src/commission/commission.service.ts` | NestJS CommissionService | Audited ✓ |
| `src/reserve/reserve.service.ts` | NestJS ReserveService | Audited ✓ |
| `src/orchestrator/orchestrator.service.ts` | Full lifecycle orchestration | Audited ✓ |
| `reference/ast-core/src/emission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/commission.ts` | Reference implementation | Audited |
| `reference/ast-core/src/reserve.ts` | Reference implementation | Audited |
| `docs/specs/AST_Emission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Commission_AGENT_EN.md` | Spec (highest authority) | Read |
| `docs/specs/AST_Reserve_AGENT_EN.md` | Spec (highest authority) | Read |

`01_coin_engine` is documentation only. The production code lives in `src/emission/` and
related NestJS modules, fully conforming to the canonical specs.

---

## 2. Canonical Model (verified against specs and docs)

```
Emission     = Transaction Amount                              (1:1)
Commission C = Transaction Amount × feeRate                    (default 0.5%)
  Node Share = C × 0.75                                       (75% → nodes, post-factum by PoT weight)
  AFC Share  = C × 0.25                                       (25% → Reserve AFC, audit accrual)

ARO lifecycle per confirmed process:
  MINT(amount)  ← PoT verified === 1
  ... process executes ...
  BURN(amount)  ← cycle completion; net = 0

Reserve:
  reserveIndex   = log10(1 + totalProcessVolume)              ← spec I-RS-1/I-RS-2; confirmed volume only
  internalPrice  = base × reserveIndex                        ← rises as confirmed work accumulates
  AFC accruals   → NodeChain (audit trail), not in formula

Reference example (coin_emission_model.md §"$10,000 transaction"):
  txAmount  = 10,000 ARO
  Emission  = 10,000 ARO  (minted 1:1)
  Commission = 50 ARO     (0.5%)
  Node pool  = 37.50 ARO  (75% of commission)
  AFC share  = 12.50 ARO  (25% of commission)
  Burn       = 10,000 ARO
  Net        = 0
```

---

## 3. Audit Findings — Full Conformance

### 3.1 `src/emission/emission.service.ts`

| Check | Result |
|-------|--------|
| `emit()` gates on `pot.getVerdict(processId).verified === 1` | ✓ |
| Returns `{ authorized: false, minted: 0, burned: 0 }` when not verified | ✓ |
| Mints exactly `amount` (1:1, no multiplier) | ✓ |
| Burns exactly `minted` on cycle completion | ✓ |
| Records `emission.minted` and `emission.burned` in NodeChain | ✓ |
| `calculate()` formula: `emission=txAmount`, `commission=txAmount×rate`, `nodeShare=C×0.75`, `afcShare=C×0.25`, `net=0` | ✓ |
| Default `commissionRate = 0.005` (0.5%) | ✓ |

**Verdict:** conforms exactly to the canonical model.

### 3.2 `src/aroscoin/aroscoin.service.ts`

| Check | Result |
|-------|--------|
| Supply identity: `totalSupply = (processMinted - processBurned) + earnedRetained` | ✓ |
| `processNet()` converges to 0 after each completed cycle (I5) | ✓ |
| `recordMint` / `recordBurn` / `recordEarned` only — no spontaneous value creation | ✓ |
| No deposit / purchase / crypto→ArosCoin path | ✓ |

**Verdict:** canonical unit ledger; no Model-A constructs.

### 3.3 `src/commission/commission.service.ts`

| Check | Result |
|-------|--------|
| `feeRate = 0.005` (0.5%) | ✓ |
| `marginRate = 0.25` (AFC share = 25%) | ✓ |
| Node distributable = `totalFees × (1 - 0.25) = 75%` | ✓ |
| Payment gated on `pot.getVerdict(processId).verified === 1` | ✓ |
| Payment is post-factum (epoch finalization, not on participation registration) | ✓ |
| `Σ(payments) + afcMargin == Σ(fees)` within epsilon (I7) | ✓ |
| AFC share routed to `reserve.addAfcAccrual()` | ✓ |

**Verdict:** canonical commission model; 75/25 split correct.

### 3.4 `src/reserve/reserve.service.ts`

| Check | Result |
|-------|--------|
| `reserveIndex = log10(1 + totalProcessVolume)` | ✓ |
| `totalProcessVolume` = sum of `emission.minted` + `commission.epoch.finalized.operationalMargin` from NodeChain | ✓ |
| Index recomputed from history on each read (I-RS-2) | ✓ |
| AFC accruals tracked separately in `reserve.afc.accrual` events (audit only) | ✓ |
| No custody, no deposit path | ✓ |

**Verdict:** canonical reserve model.

---

## 4. Module `01_coin_engine` Status

`01_coin_engine/` is a **documentation folder**, not production code. It contains:
- `aro_emission_protocol.md` — canonical emission protocol spec
- `coin_emission_model.md` — canonical model with the $10,000 worked example
- `burn_and_mint_rules.md`, `burn_mechanism.md`, `node_participation_payments.md`, etc.

It is **not deprecated** — it serves as a canonical reference document. The production
implementation that fulfils this spec lives in `src/emission/`, `src/aroscoin/`,
`src/commission/`, and `src/reserve/`. No migration is needed.

---

## 5. Model-A Constructs — None Present

Grep confirmed: no `staking`, `slashing`, `mintOnDeposit`, `crypto_to_aroscoin`,
`token-weighted governance`, or similar Model-A constructs exist in `src/`. The migration
is complete.

---

## 6. Test Coverage

`src/emission/emission.service.spec.ts` exercises:
- I1/I5/I6: `emit()` on verified process nets process part to 0; `totalSupply == retained`
- I1/I2/P7: `emit()` on unverified process mints nothing
- P7: verdict 0 (incomplete evidence) mints nothing
- I2: `mint()` throws on unverified process
- NodeChain records: `emission.minted` and `emission.burned` events present
- I4: identical verified emissions yield identical supply outcomes
- Canonical formula: $10,000 example returns `emission=10000, commission=50, nodeShare=37.5, afcShare=12.5, net=0`
- Custom commission rate accepted

All invariants pass.

---

## 7. Conclusion

**The production codebase fully implements the canonical 1:1 emission model.** No corrections
were required. The code correctly enforces:

1. Emission only on PoT-verified processes (`verified === 1`)
2. 1:1 mint of process part (no multiplier)
3. Full burn on cycle completion (net = 0)
4. Commission = txAmount × 0.5%; split 75% nodes / 25% AFC reserve
5. Post-factum payment by PoT-confirmed participation weight
6. Reserve index derived from confirmed-work history only
7. Pool reconciliation: no remainder after epoch finalization

No prohibited constructs (staking, slashing, mint-on-deposit, token-weighted governance) are
present in the production modules.
