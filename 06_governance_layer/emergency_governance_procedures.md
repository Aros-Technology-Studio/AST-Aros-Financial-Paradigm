# emergency_governance_procedures.md

## 1. Purpose

This document defines the emergency response protocol for the AST governance system. It ensures that in critical or hostile conditions, governance participants have tools to:

- Pause, freeze, or veto dangerous proposals
- Override or lock contract executions
- Protect the system from coordinated attacks or exploits
- Maintain transparency even during rapid-response events

---

## 2. What Qualifies as an Emergency?

An **emergency** is defined as:

- Exploit discovered in an active or proposed contract
- Governance attack (vote-buying, mass delegation abuse)
- Misclassification of proposal impact level
- Actionable threat identified by Compliance Oracle or external audit

Emergencies are flagged via formal signals by Council Members or system monitors.

---

## 3. Emergency Freeze Mechanism

Council Members can initiate a freeze as follows:

```solidity
function freezeProposal(uint256 proposalId) external onlyCouncil;
```

Freeze requirements:

- Co-signature from a second Council Member
- Written justification attached to freeze call
- Entry logged in `GovernanceLedger` with timestamp

Duration:

- 72 hours (default)
- Renewable via governance vote

---

## 4. Emergency Veto Procedure

For **Critical Impact** proposals, the Governance Admin may trigger a veto:

```solidity
function vetoProposal(uint256 proposalId) external onlyGovernanceAdmin;

```

Conditions:

- Must be used **before voting ends**
- Requires compliance clearance
- Cannot be overridden without supermajority council vote

The proposal is permanently marked as `vetoed`.

---

## 5. Emergency Role Suspension

The Compliance Oracle may:

- Temporarily disable proposal authorship
- Lock voting rights of compromised accounts
- Prevent stake withdrawal during investigation

This action is subject to logging and requires digital signatures from at least 2 out of 3 Oracle nodes.

---

## 6. Immutable Logging

All emergency actions are:

- Timestamped
- Justified via structured message (e.g. JSON or IPFS doc ref)
- Logged in the `EmergencyResponseLog` contract
- Auditable externally and internally

Each record includes:

```json
{
  "action": "freezeProposal",
  "proposalId": 112,
  "initiatedBy": "0xCouncilMember1",
  "cosignedBy": "0xCouncilMember2",
  "timestamp": 1731831947,
  "reason": "Detected double-voting exploit attempt"
}

```

---

## 7. Emergency Recovery Protocol

After a freeze or veto:

- Proposal state is locked for 72h cooldown
- Recovery team (optional multisig) may issue patch proposal
- Users are notified via Governance Feed and external gateways
- A restoration proposal may be triggered by community quorum vote

This ensures a **return-to-stability cycle** without silent rollback.

---

## 8. Integration Points

| Component | Role |
| --- | --- |
| ProposalEngine | Locks affected proposals |
| GovernanceLedger | Logs emergency status changes |
| Compliance Oracle | Suspends actors under investigation |
| EmergencyResponseLog | Stores freeze/veto history and structured reasons |
| VotingContract | Prevents new votes during freeze period |

---

## 9. Summary

Emergency protocols act as **constitutional guardrails** to protect AST against abuse, coordination failures, and technical attacks — **without centralizing power**.

---

## 10. Next Steps

Final layer for governance traceability:

- `governance_auditability.md`
