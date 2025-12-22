# validator_epoch_commitments.md

## Module: Validator Epoch Commitments
- **Layer**: Validator Node Security Deposit & Payment System — AST (Aros Studio Tokenomics)
- **Status**: Production-grade
- **Author**: Aros Studio NodeChain Division
- **Last Updated**: 2025-07-05

---

## Overview

This document defines the rules and lifecycle for epoch-level validator commitments. Validators in the AST network must commit their deposit and performance to fixed-duration validation epochs. Each epoch operates as a checkpoint for eligibility, performance assessment, and payment allocation.

Epoch commitments are strictly binding once confirmed and are managed through the Epoch Scheduler component of AST.

---

## Epoch Structure

| Parameter        | Value                     |
|------------------|---------------------------|
| Epoch Duration   | 7 days (default)          |
| Epoch ID Format  | `uint64` sequence         |
| Max Validators   | 512 per epoch             |
| Min Deposit        | 10,000 AROS               |
| Finality Window  | Last 24h of epoch         |

---

## Commitment Lifecycle

```mermaid
flowchart TD
    A[Epoch Begins] --> B[Validator Enters Queue]
    B --> C[Epoch Slot Assigned]
    C --> D[Deposit Lock Activated]
    D --> E[Validation Activity Window]
    E --> F[Epoch Nearing End]
    F --> G{Performance OK?}
    G -- Yes --> H[Eligible for Payment]
    G -- No --> I[Trigger Forfeiture]
    H --> J[Epoch Ends]
    I --> J
    J --> K[Next Epoch Recommit or Exit]

```

---

```mermaid
flowchart TD
    A[Epoch Begins] --> B[Validator Enters Queue]
    B --> C[Epoch Slot Assigned]
    C --> D[Deposit Lock Activated]
    D --> E[Validation Activity Window]
    E --> F[Epoch Nearing End]
    F --> G{Performance OK?}
    G -- Yes --> H[Eligible for Payment]
    G -- No --> I[Trigger Forfeiture]
    H --> J[Epoch Ends]
    I --> J
    J --> K[Next Epoch Recommit or Exit]
```

## Key Commitment Rules

- Validators must confirm entry at least 12 hours before the epoch start
- Missed entry window results in deposit being deferred to the next available epoch
- Exit requests must be filed at least 24 hours before epoch end
- Early withdrawals are forbidden unless triggered by governance override

---

## Epoch State Flags

| Flag | Meaning |
| --- | --- |
| `scheduled` | Validator has reserved slot for upcoming epoch |
| `active` | Validator is currently attesting |
| `completed` | Epoch ended, results pending processing |
| `penalized` | Violations detected during commitment |
| `exited` | Validator opted out or was removed |

---

## Performance Binding

During each epoch, validator behavior is evaluated continuously. Performance metrics include:

- Attestation correctness
- Latency under peak load
- Downtime (threshold: max 5%)
- Discrepancy signals from NodeChain observers

Failure to meet these standards results in:

- Payment reduction
- Potential freeze or forfeiting
- Eligibility suspension for upcoming epochs

---

## Governance Control Points

- Epoch duration can be adjusted via governance vote
- Emergency ejection of validator during epoch (with audit trail)
- Epoch state history recorded and published per cycle
- Batch override possible via `EpochOverridePackage`

---

## Smart Contract Functions

| Function | Description |
| --- | --- |
| `assignValidatorToEpoch()` | Assign validator to next available slot |
| `confirmEpochEntry()` | Lock in deposit for upcoming epoch |
| `requestEpochExit()` | Mark validator for removal after current epoch |
| `getEpochState(vid)` | Retrieve validator epoch status |

---

## Dependencies

- `security deposit_overview.md`
- `validator_registration.md`
- `deposit_freeze_unlock_rules.md`
- `payment_distribution_engine.md`
- `validator_performance_score.md`

---

## Next

→ See [`payment_distribution_engine.md`](https://www.notion.so/validator_payments/payment_distribution_engine.md) to understand how payments are calculated and issued at the end of each epoch.

```

```
