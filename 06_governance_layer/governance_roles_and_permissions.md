# governance_roles_and_permissions.md

## 1. Purpose

This document defines the **hierarchy of roles**, their associated **permissions**, and the **access control boundaries** within the Aros Studio Tokenomics (AST) governance system. It ensures that:

- No unauthorized participant can escalate power
- Critical actions are gated by specific role checks
- All permissions are traceable, revocable, and logged

---

## 2. Role Types

AST defines the following governance roles:

| Role                | Description                                                       |
|---------------------|-------------------------------------------------------------------|
| 🧑‍💻 Proposal Author  | May draft and submit proposals (with token stake)                  |
| 🗳 Voter             | May vote on proposals with staked governance tokens               |
| 🧠 Council Member    | Has the right to assign proposal impact level, freeze proposals   |
| 🔐 Compliance Gate   | Flags malicious users and enforces jurisdictional constraints     |
| 🧑‍⚖️ Governance Admin | May manage permissions, grant/revoke roles (requires quorum)     |
| ⏳ Observer (read-only) | May access and export data but cannot act                       |

Each role is bound to an address and stored in the `PermissionsRegistry`.

---

## 3. Permission Matrix

| Action                         | Required Role(s)                     |
|--------------------------------|--------------------------------------|
| Submit proposal                | Proposal Author                      |
| Vote on proposal               | Voter                                |
| Assign proposal impact level   | Council Member                       |
| Freeze proposal (emergency)    | Council Member + quorum              |
| Grant governance role          | Governance Admin (with supermajority)|
| Revoke user participation      | Compliance Gate                      |
| View full ledger history       | Any (including Observer)             |

---

## 4. Role Grant & Revocation

Roles are granted via:

```solidity
function grantRole(bytes32 role, address user) external onlyGovernanceAdmin;
function revokeRole(bytes32 role, address user) external onlyGovernanceAdmin;

```

Each grant/revoke action is:

- Logged on-chain
- Hash-verified and timestamped
- Subject to a minimum time-lock before becoming active

---

## 5. Escalation Constraints

No user may escalate from `Voter` to `Council Member` or `Governance Admin` without:

- A passed proposal that explicitly includes the role change
- Compliance clearance from the Oracle
- Delay window of at least 7 days after approval

This prevents “instant takeovers” or identity laundering.

---

## 6. Emergency Powers

If a proposal poses a verified systemic threat, a **Council Member** may issue:

```solidity
function freezeProposal(uint256 proposalId) external onlyCouncil;

```

To be effective:

- Must be cosigned by a second Council Member
- Must include justification message
- Is immediately visible in Governance Ledger

The freeze lasts up to 72 hours unless extended via quorum vote.

---

## 7. Observer Rights

Observers may:

- View all governance actions
- Export audit logs
- Analyze proposal and voting patterns

They **may not**:

- Vote
- Propose
- Delegate
- Interact with execution contracts

This allows for public transparency without compromising control.

---

## 8. Integration Points

| Component | Role Enforcement |
| --- | --- |
| PermissionsRegistry | Stores and validates role → address mapping |
| ProposalEngine | Enforces role on submission and escalation |
| VotingContract | Verifies voter role before ballot |
| Compliance Oracle | Provides external clearance input |
| GovernanceLedger | Logs all role changes and permission actions |

---

## 9. Next Steps

With role-based access control defined, we now design fallback protocols:

- `emergency_governance_procedures.md`
