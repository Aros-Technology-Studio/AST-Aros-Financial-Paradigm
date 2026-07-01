### burn_mechanism.md

## I. Purpose

This document defines the rules, logic, and protocol triggers for the token burn mechanism in AST. The mechanism ensures deflationary pressure, dynamic balance, and structural alignment with AST’s emission model.

## II. Scope

The burn logic is embedded directly in the transaction processing layer of AST. It affects ARO tokens used in successful transaction cycles and interacts with the token_generation_contract.md.

⸻

## III. Burn Logic Overview

**1. Process-Part Burning (canonical, 1:1)**
- The entire minted process part is burned on cycle completion — not a fraction of the fee.
- Example:
  ```
  txAmount = 2.00 ARO
  emission (minted) = 2.00 ARO   (1:1 with txAmount)
  burn (on completion) = 2.00 ARO
  net circulating change = 0
  ```
- The commission (`txAmount × rate`, default 0.5%) is a *separate* flow: 75% to the node pool,
  25% to the AFC reserve. It is never burned — see `payment_distribution.md` and
  `coin_emission_model.md`.

**2. NodeChain Incentive Alignment**
- The process part's mint and burn are both recorded in NodeChain (`emission.minted`,
  `emission.burned`), so `processMinted == processBurned` after every confirmed cycle (I5).
- Node payment comes from the commission pool, not from the burned process part — burning the
  process part has no effect on node earnings; it only keeps `totalSupply` derived purely from
  `earnedRetained` once cycles complete (I6).

**3. Reserve Growth (organic throttle)**
- There is no separate overflow-burn schedule: the AFC reserve share (25% of commission) grows
  `reserveIndex = log10(1 + totalProcessVolume)` monotonically with confirmed volume, making the
  internal price of future emission rise organically as activity grows (`coin_volatility_controls.md`).

**4. Audit Trail**
- Every burn is an explicit NodeChain event (`emission.burned`, `{ processId, burned }`) rather
  than a transfer to a dead-letter address; the append-only chain is itself the audit trail
  (I3, I8).

⸻

## IV. Parameters and Constants

| Parameter        | Description                                      | Default Value |
|-------------------|--------------------------------------------------|----------------|
| commissionRate    | Fraction of `txAmount` charged as commission     | 0.5%           |
| marginRate        | Share of commission routed to the AFC reserve    | 25%            |

⸻

## V. Execution Flow

```
flowchart TD
    A[Confirmed Process, verified == 1] --> B[EmissionService.mint: process part = amount]
    B --> C[NodeChain: emission.minted]
    C --> D[CommissionService.accrue: fee = amount × rate]
    D --> E[EmissionService.burn: process part]
    E --> F[NodeChain: emission.burned]
```

⸻

## VI. Monitoring and Audit

- Every mint/burn is appended to NodeChain and readable by any auditor without replaying
  transaction execution (I3, I8).
- The All-Seeing Eye observes each cycle and compares supply (`AllSeeingEyeService.compareSupply`)
  but never halts or reverses a burn itself (P6).
- Reference implementation: `src/emission/emission.service.ts` (`EmissionService.mint`/`.burn`).

