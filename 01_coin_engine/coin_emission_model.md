# AROS Coin — Canonical Emission Model

## Overview

The emission model of AROS Coin is designed to ensure **predictability**, **non-speculative growth**, and **self-sustainability** of the ecosystem. Unlike mining-based blockchains, AROS Coin uses a **1:1 transaction-amount emission** principle tightly coupled with Proof-of-Transaction (PoT). This makes it energy-efficient, economically justified, and resistant to artificial inflation.

## Core Emission Principles

- **No Pre-allocation**: No coins are created at launch or reserved for founders or institutions.
- **No Fixed Supply**: AROS Coin does not enforce a hard cap. Supply is organically regulated by transaction volume.
- **1:1 Emission**: For every verified transaction of amount `A`, exactly `A` ARO tokens are minted. Emission is bounded by real economic activity — no idle emission.
- **Transient Tokens**: Emitted ARO are burned on transaction completion. Net circulating supply change per canonical transaction cycle is zero. The ledger retains a full audit trail of all mints and burns.

## Canonical Emission Formula

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × rate    (default rate = 0.5%)
Node Share   = Commission × 0.75            (75% → distributed to processing nodes by PoT weight)
AFC Reserve  = Commission × 0.25            (25% → recorded in NodeChain as AFC accrual)
```

### Example: $10,000 transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (minted, PoT-gated, 1:1)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight, post-factum)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (recorded in NodeChain via reserve.addAfcAccrual)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0
```

## Reserve Price Index

The internal price index rises as confirmed process volume accumulates:

```
reserveIndex = log10(1 + totalProcessVolume)
```

Soft logarithmic growth: meaningful at scale while staying bounded. `totalProcessVolume`
sums the minted amounts of all PoT-verified processes from NodeChain history (`emission.minted`
events). The index is derivable (recomputed from history, never stored as free authority)
and monotonic — it can only increase as confirmed work accumulates.

Internal price: `internalPrice = base × reserveIndex`

AFC accruals (the 25% commission share) are recorded in NodeChain for full auditability.
They do not enter the `reserveIndex` formula directly; the index reflects confirmed work
volume, not commission derivatives. This is canonical per `docs/specs/AST_Reserve_AGENT_EN.md`
and `reference/ast-core/src/reserve.ts`.

## Anti-Inflationary Measures

- **Burn Mechanism**: Every emitted ARO is burned after the transaction completes (net-zero supply impact per TX cycle).
- **Reserve Index Growth**: The rising price index makes future emissions more costly, organically throttling speculative activity.
- **Dynamic Commission Rate**: Governance can adjust the commission rate within protocol-defined bounds.
- **Validator Rotation**: Prevents cartelization of node reward capture.

## Epoch-Level Distribution

At each epoch finalization, all collected fees are distributed with the canonical split:

- **75%** → node pool (divided by PoT-normalized weight per active validator node)
- **25%** → AFC reserve accrual (recorded in NodeChain, routed via `ReserveService.addAfcAccrual`)

## AI-Driven Governance Adjustments

The emission logic includes:
- **Feedback loops** via The All-Seeing Eye for abuse prevention.
- **Dynamic adjustment models** based on network stress, coin velocity, and macro indicators.
- **Audit hooks** into every emission cycle for reproducibility and trust.

## Emission Phases

| Phase       | Description                                       | Trigger Condition                          |
|-------------|---------------------------------------------------|--------------------------------------------||
| Bootstrap   | Minimal emission for early transactions           | First 10,000 verified transactions          |
| Expansion   | Normal 1:1 emission begins                        | After bootstrap phase                       |
| Stability   | Adaptive commission scaling, AFC index meaningful | AFC reserve > threshold                     |
| Correction  | Commission rate adjusted via governance           | Inflation risk or validator overloading     |

## Reference Implementation

Canonical code: `src/emission/emission.service.ts` — `EmissionService`

Key methods:
- `emit(processId, amount)` — PoT-gated full lifecycle; mints then burns the process part (1:1)
- `mint(processId, amount)` — throws if `verified !== 1`; records `emission.minted` in NodeChain
- `burn(processId, amount)` — burns on cycle completion; records `emission.burned` in NodeChain
- `totalSupply()` — delegated to `ArosCoinService`

Reserve: `src/reserve/reserve.service.ts` — `ReserveService`
- `reserveIndex()` — `log10(1 + totalProcessVolume)` derived from NodeChain history
- `addAfcAccrual(amount)` — records the 25% AFC share in NodeChain (called by Commission)

Commission: `src/commission/commission.service.ts` — `CommissionService`
- `computeFee(amount)` — `amount × 0.005` (default 0.5%)
- `accrue(epoch, fee, participants)` — accumulates fees into the open epoch pool
- `finalizeEpoch(epoch)` — distributes 75% to nodes, 25% to AFC; reconciles pool to zero

⸻
