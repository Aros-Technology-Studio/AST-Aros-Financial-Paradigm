# forfeiting_and_penalty_rules.md 

## Module: Forfeiture and Penalty Rules
- **Layer**: Validator Node Security Deposit & Payment System — AST (Aros Studio Tokenomics)
- **Status**: Production-grade
- **Author**: Aros Studio NodeChain Division
- **Last Updated**: 2025-07-05
---

## Overview

This module defines the mechanisms for detecting, enforcing, and recording penalties — including full or partial forfeiting of validator deposit — within the AST network. The forfeiting engine ensures validator accountability by punishing harmful, negligent, or malicious behavior.

---

## Types of Penalties

| Type                   | Description |
|------------------------|-------------|
| `Soft Penalty`         | Temporary payment reduction or epoch suspension |
| `Hard Penalty`         | Permanent deposit loss (partial or full) |
| `Governance Slash`     | Triggered via governance override vote |
| `Fraud Detection Slash`| Automated forfeiting based on NodeChain evidence |

---

## Forfeiture Triggers

| Violation                       | Severity | Default Penalty |
|----------------------------------|----------|------------------|
| Missed ≥3 attestations / epoch   | Medium   | −25% deposit |
| Downtime > 20% of epoch runtime  | Medium   | −30% payment |
| Fraudulent signature             | Critical | −100% deposit |
| Tampering with metadata          | High     | −50% deposit |
| Repeated underperformance        | Medium   | −10% per epoch |
| Disobeying governance resolution | Critical | Immediate kick + deposit burn |

---

## Enforcement Pipeline

```mermaid
sequenceDiagram
    participant N as NodeChain Monitor
    participant V as Validator
    participant S as Forfeiture Engine
    participant G as Governance Layer

    N->>S: reportViolation(validatorID, evidence)
    S->>S: verifyEvidence()
    alt Valid
        S->>V: issuePenalty()
        S->>G: logForfeitureEvent()
    else Invalid
        S->>N: discardReport
    end

```

---

## Deposit Burn Formula

```
burn_amount = validator_deposit × penalty_ratio

```

Where `penalty_ratio` ∈ [0.0, 1.0], as defined per violation.

---

## Appeal Process

- Slashed validators may appeal via `/governance/appeal`
- Review committee votes based on log records and metadata snapshots
- Successful appeal → partial refund, flag cleared
- Failed appeal → blacklist + cooldown (5 epochs)

---

## Governance Safeguards

| Rule | Description |
| --- | --- |
| `Multi-signature Override` | Manual forfeit requires ≥ 66% validator vote |
| `Audit Snapshot Lock` | Forfeiture must reference immutable audit hash |
| `Cooldown Enforcement` | Slashed node cannot re-register for N epochs |
| `Penalty Disclosure` | All events publicly logged in payment engine |

---

## Smart Contract Functions

| Function | Description |
| --- | --- |
| `forfeitDeposit(address, amount)` | Burn specific amount of validator deposit |
| `logViolation(vid, data)` | Record violation in audit trail |
| `blockValidator(address)` | Disable validator permanently |
| `appealForfeiture(address)` | Submit appeal for forfeiting decision |

---

## Audit Anchors

Each forfeiting event includes:

- Epoch ID
- Forfeiture reason code
- Validator ID
- Audit hash
- Timestamp
- Governance signature (if manual)

Example:

```json
{
  "epoch": 4032,
  "vid": "V-19284",
  "penalty": "fraud_signature",
  "amount": 10000,
  "audit_hash": "0xB91D...",
  "timestamp": 1720834123
}

```

---

## Dependencies

- `validator_performance_score.md`
- `payment_distribution_engine.md`
- `security deposit_governance_interface.md`

---

## Next

→ See [`security deposit_governance_interface.md`](https://www.notion.so/validator_api/security deposit_governance_interface.md) to understand how governance resolutions and appeals are handled through the validator API.

```

```
