# token_supply_governance.md (1)

---

```
# token_supply_governance.md

## Purpose

This document defines the policy and architecture for governing the **total, circulating, and locked supply** of ArosCoin (ARO). It outlines the mechanisms that ensure transparency, predictability, and algorithmic oversight over all supply-related operations within AST.

---

## Goals

- Ensure non-inflationary behavior and long-term scarcity
- Automate maximum supply constraints
- Allow controlled, auditable minting for exceptional system needs
- Integrate on-chain governance for supply rule changes

---

## Core Parameters

| Parameter              | Description                                      |
|------------------------|--------------------------------------------------|
| `max_supply`           | Hard cap of total possible ARO tokens (e.g. 1B)  |
| `initial_circulation`  | Amount available at genesis                      |
| `mintable_pool`        | Reserved supply allowed to be minted under vote |
| `burnable_ratio`       | % of tokens that can be burned per epoch        |
| `supply_floor`         | Absolute minimum of circulating ARO             |

---

## Key Functions

### 1. Minting Policy

- Only allowed via `mintRequest()` function through on-chain proposal
- Requires:
  - Proposal ID
  - Justification hash
  - Target distribution plan
  - Quorum + approval by governance

### 2. Burn Protocol

- Triggered by:
  - `burnByUser()` voluntarily
  - `burnByNode()` as a penalty or condition
  - `burnByProtocol()` as part of economic adjustment
- Each burn is recorded in the Token Audit Trail

### 3. Re-locking Mechanism

- Ability to re-lock tokens for:
  - Governance manipulation protection
  - Strategic liquidity freezes
- Locked tokens are excluded from circulating metrics

---

## Governance Model

- **Layer-2 Governance Contract** determines:
  - Supply adjustment triggers
  - Mint request handling
  - Lock/unlock authorization

- Governed by:
  - Weighted Node Vote
  - Emergency override by The All-Seeing Eye (if anomaly detected)

---

## Monitoring & Reporting

- Public supply stats endpoint (`/api/supply`)
- Real-time charts on dashboard:
  - Total supply
  - Circulating vs locked
  - Burn history
  - Mint events

- Periodic Merkle Snapshots of supply state

---

## File Location

This document belongs to the AST repository under:
```

/docs/tokenomics/token_supply_governance.md