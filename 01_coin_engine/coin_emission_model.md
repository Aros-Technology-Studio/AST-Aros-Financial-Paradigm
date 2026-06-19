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
AFC Reserve  = Commission × 0.25            (25% → locked in AFC reserve contract)
```

### Example: $10,000 transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (minted to recipient, 1:1)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0
```

## AFC Reserve and Internal Price Index

As confirmed process volume accumulates in NodeChain, the capitalization index rises:

```
reserveIndex = log10(1 + totalProcessVolume)
```

Soft logarithmic growth: meaningful at scale, bounded against runaway inflation.
`internalPrice = base × reserveIndex` — internal valuation follows confirmed work.

AFC reserve accruals (the 25% share per epoch) are recorded in NodeChain as
`reserve.afc.accrual` events and are auditable independently; they grow alongside
confirmed work because both originate from the same transaction volume.

## Anti-Inflationary Measures

- **Burn Mechanism**: Every emitted ARO is burned after the transaction completes (net-zero supply impact per TX cycle).
- **AFC Reserve Growth**: The rising price index makes future emissions costlier, organically throttling speculative activity.
- **Dynamic Commission Rate**: Governance can adjust the commission rate within protocol-defined bounds.
- **Validator Rotation**: Prevents cartelization of node reward capture.

## Epoch-Level Distribution

At each epoch finalization, all collected fees (from `tx.fee` fields) are distributed with the same canonical split:

- **75%** → node pool (divided by PoT-normalized weight per active validator node)
- **25%** → AFC reserve contract (`SYSTEM_AFC_RESERVE_000000000000000000`)

## AI-Driven Governance Adjustments

The emission logic includes:
- **Feedback loops** via The All-Seeing Eye for abuse prevention.
- **Dynamic adjustment models** based on network stress, coin velocity, and macro indicators.
- **Audit hooks** into every emission cycle for reproducibility and trust.

## Emission Phases

| Phase       | Description                                       | Trigger Condition                          |
|-------------|---------------------------------------------------|--------------------------------------------|
| Bootstrap   | Minimal emission for early transactions           | First 10,000 verified transactions          |
| Expansion   | Normal 1:1 emission begins                        | After bootstrap phase                       |
| Stability   | Adaptive commission scaling, AFC index meaningful | AFC reserve > threshold                     |
| Correction  | Commission rate adjusted via governance           | Inflation risk or validator overloading     |

## Reference Implementation

Canonical code: `src/emission/emission.service.ts` — `EmissionService`

Key methods:
- `calculate(txAmount, commissionRate?)` — pure canonical formula, no side effects
- `emit(processId, amount)` — PoT-gated mint then burn cycle for a confirmed process
- `mint(processId, amount)` — mint step; throws when process not PoT-verified
- `burn(processId, amount)` — burn step on cycle completion
- `totalSupply()` — current derived supply from the unit ledger

Reserve index: `src/reserve/reserve.service.ts` — `ReserveService.reserveIndex()`
Commission split: `src/commission/commission.service.ts` — `CommissionService.finalizeEpoch()`

⸻
