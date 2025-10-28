# validator_registration.md

## Module: Validator Registration
- **Layer**: Validator Staking & Reward System — AST (Aros Studio Tokenomics)
- **Status**: Production-grade
- **Author**: Aros Studio Blockchain Division
- **Last Updated**: 2025-07-05
---

## Overview

This document outlines the formal registration procedure for becoming a validator in the AST network. Validators must undergo identity provisioning, stake verification, epoch scheduling, and key binding prior to participating in any transaction validation or attestation.

---

## Eligibility Criteria

| Requirement                  | Detail |
|------------------------------|--------|
| Stake Commitment             | ≥ 10,000 AROS |
| Unique Node Identity         | Enforced via cryptographic keypair |
| Network Reachability         | Must expose gRPC + REST ports |
| Performance Baseline         | Must pass testnet trial or benchmark |
| Governance Acceptance        | Must not be in denied registry |

---

## Registration Workflow
```

---

```mermaid
sequenceDiagram
    participant V as Validator Node
    participant R as Registry Contract
    participant G as Governance Layer

    V->>R: submitRegistrationRequest(pubKey, nodeMetadata)
    R-->>V: assignProvisionalID + awaitStake
    V->>R: stake(amount ≥ min)
    R->>G: notifyGovernanceForReview
    G-->>R: approveOrReject()
    R-->>V: registrationFinalized / rejected
```

## Node Metadata Schema

```json
{
  "node_name": "Node-Alpha-117",
  "location": "DE-FRA",
  "operator_pubkey": "0xB1A2...",
  "contact_email": "node@alpha.org",
  "version": "AST-Core/v1.2.4",
  "infra_provider": "BareMetal",
  "jurisdiction": "EU"
}

```

---

## Finalization Logic

Once governance approval is received, the validator must:

1. Complete signature handshake for private key validation
2. Acknowledge slashing policy and binding agreements
3. Be scheduled into next open epoch by Epoch Controller
4. Receive validator ID (VID) and node hash

---

## Key Contracts & Functions

| Contract | Function | Purpose |
| --- | --- | --- |
| ValidatorRegistry | `submitRegistration()` | Accepts new validator metadata |
| StakingContract | `stake()` | Locks required AROS |
| GovernanceBridge | `approveValidator(address)` | Confirms validator approval |
| EpochScheduler | `assignEpoch(address)` | Assigns node to epoch window |

---

## Rejection Criteria

- Duplicate node identity
- Use of banned infrastructure (e.g. TOR nodes, VPN chains)
- Jurisdictional conflict (e.g. sanctions list)
- Failure to stake within 12 hours
- Governance rejection after metadata analysis

---

## Public API for Validators

| Endpoint | Method | Description |
| --- | --- | --- |
| `/validator/register` | POST | Submit validator registration |
| `/validator/status/{address}` | GET | Query current registration status |
| `/validator/metadata/{vid}` | GET | Retrieve public node metadata |
| `/validator/list/active` | GET | List all active validators |

---

## Dependencies

- `staking_overview.md`
- `stake_freeze_unlock_rules.md`
- `validator_epoch_commitments.md`
- `staking_governance_interface.md`

---

## Next

→ See [`stake_freeze_unlock_rules.md`](https://www.notion.so/aros-studio/stake_freeze_unlock_rules.md) to learn how staked funds are locked, released, or penalized.

```

```
