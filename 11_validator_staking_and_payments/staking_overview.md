# staking_overview.md

## Module: Staking Overview
- **Layer**: Validator Staking & Payment System — AST (Aros Studio Tokenomics)
- **Status**: Production-grade
- **Author**: Aros Studio Blockchain Division
- **Last Updated**: 2025-07-05

---

## Purpose

This document provides a high-level overview of the staking mechanism in the AST network. It defines the goals, structure, actors, and lifecycle of validator staking within the Proof of Transaction (PoT)-driven architecture.

Staking in AST is not only an economic commitment but a governance and security requirement. All validator rights and payments are conditional on active stake lock-in and performance adherence.

---

## Key Principles

- **Stake-to-Validate**: Only nodes with an active stake are eligible to validate transactions and participate in PoT attestation.
- **Epoch-Based Lifecycle**: Stake commitment is tied to epoch duration; early withdrawal is not permitted.
- **Slashing Enforcement**: Misbehavior or inactivity results in stake reduction or full penalty.
- **Payment Binding**: Emission payments are distributed proportionally to stake-weighted and performance-based validators.

---

## Staking Roles

| Role              | Description |
|-------------------|-------------|
| `Validator`        | Node that locks stake and validates transactions |
| `Delegator`        | (Optional) Entity that delegates stake to validator node |
| `Governance`       | Oversees staking contracts, slashing, and payment policies |
| `Epoch Controller` | Coordinates epoch lifecycle and validator scheduling |

---

## Stake Requirements

| Parameter        | Value                          |
|------------------|--------------------------------|
| Minimum Stake    | 10,000 AROS                    |
| Lock Period      | 1 Epoch (default = 7 days)     |
| Withdrawal Delay | 1 additional epoch             |
| Slash Threshold  | 3 missed attestations/epoch    |

All staking actions are finalized on-chain and signed by the validator’s keypair. Governance can increase the minimum dynamically based on network conditions.

---

## Staking Lifecycle

```mermaid
flowchart TD
    A[Start Stake Request] --> B[Lock AROS Tokens]
    B --> C[Stake Confirmation]
    C --> D[Assigned to Next Epoch]
    D --> E[Active Validation & Monitoring]
    E --> F[Epoch Ends]
    F --> G{Penalty or Payment?}
    G -- Penalty --> H[Slash Stake]
    G -- Payment --> I[Distribute Payment]
    H --> J[Stake Frozen or Reduced]
    I --> J
    J --> K[Recommit or Unstake]

```

---

## Performance-Linked Mechanism

Stake is not static: validator performance is continuously monitored via:

- TX confirmation latency
- Attestation accuracy
- Fraud flag rate
- Participation ratio

Performance score directly impacts both payment multiplier and slashing sensitivity.

---

## Smart Contract Interface (Summary)

| Function | Description |
| --- | --- |
| `stake(address, amount)` | Lock tokens for validator |
| `unstake()` | Request withdrawal after epoch ends |
| `penalize(address)` | Slash specific validator |
| `payment(address)` | Issue payment after epoch |
| `getStake(address)` | Query current stake amount |

---

## Governance Hooks

- Stake thresholds adjustable via `staking_governance_interface.md`
- Emergency freeze or override callable by governance quorum
- Epoch performance snapshots reviewed every cycle

---

## Dependencies

- `validator_registration.md`
- `stake_freeze_unlock_rules.md`
- `payment_distribution_engine.md`
- `validator_performance_score.md`
- `staking_governance_interface.md`

---

## Next

→ See [`validator_registration.md`](https://www.notion.so/aros-studio/validator_registration.md) to understand how validator identities are created, verified, and enrolled.

```

```
