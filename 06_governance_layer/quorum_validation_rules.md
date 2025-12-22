# quorum_validation_rules.md

## 1. Purpose

This document defines how **quorum** is calculated, validated, and enforced in the AST governance system. Quorum ensures that proposals cannot be passed or executed without meaningful participation from governance token holders.

---

## 2. What is Quorum?

In AST, **quorum** is the **minimum participation threshold** (by token weight) that must be met for a proposal to be considered valid.

> If quorum is not reached, the proposal is automatically rejected, regardless of how many “yes” or “no” votes were cast.

---

## 3. Quorum Calculation

Quorum is measured as:

```text
Quorum = Σ(voting weight of participants) / Σ(total eligible staked tokens at snapshot)

```

This results in a percentage between 0% and 100%.

---

## 4. Quorum Thresholds

AST defines three tiers of quorum depending on **proposal impact level**:

| Impact Level | Quorum Threshold | Notes |
| --- | --- | --- |
| Low | 10% | Cosmetic or internal technical changes |
| Medium | 25% | Policy or operational parameter updates |
| High | 40% | Financial reallocations, delegation rights |
| Critical | 60% | Governance logic, contract structure, vetoes |

The `impactLevel` is declared by the proposer but must be confirmed by Governance Council or pre-vote classifier contract.

---

## 5. Quorum Evaluation Logic

```solidity
function isQuorumReached(uint256 proposalId) public view returns (bool) {
    Proposal memory p = proposals[proposalId];
    uint256 totalWeight = getTotalStakedAtSnapshot(p.snapshotBatch);
    uint256 voteWeight = p.totalVotesWeight;
    return (voteWeight * 100 / totalWeight) >= p.requiredQuorumPercent;
}

```

This is evaluated automatically at the end of the voting period.

---

## 6. Failed Quorum Effects

If a proposal fails quorum:

- It is marked as `rejected_due_to_quorum`
- All staked tokens remain untouched
- The proposer cannot resubmit the same content for a cooldown period
- An audit log is created for transparency

---

## 7. Dynamic Quorum Adjustments (Optional)

Governance may vote to enable **dynamic quorum scaling**, where:

- Long periods of inactivity reduce base quorum
- High proposal volume increases quorum to prevent flooding
- Abuse patterns detected by Compliance Oracle raise minimum quorum temporarily

This feature is disabled by default.

---

## 8. Integration Points

| Component | Role |
| --- | --- |
| VotingContract | Calculates voting weight per participant |
| ProposalEngine | Records declared impact level |
| Compliance Oracle | Can exclude malicious voters from quorum calculation |
| GovernanceLedger | Logs final quorum result and status |

---

## 9. Summary

> “Without quorum, there is no legitimacy — only noise.”
> 

The quorum system protects the integrity of governance by ensuring decisions are based on **collective intent**, not apathy or manipulation.

---

## 10. Next Steps

Next, we define the roles, permissions, and escalation logic in:

- `governance_roles_and_permissions.md`
