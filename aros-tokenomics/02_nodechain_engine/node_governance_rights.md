# node_governance_rights.md (1)

---

```markdown
# node_governance_rights.md

## 🎯 Purpose

This document defines the scope of governance rights granted to validator nodes within the AST network. It outlines the mechanisms by which nodes may participate in protocol evolution, vote on proposals, challenge decisions, and influence network parameters.

---

## 1. Governance Participation Eligibility

- Only validator nodes with active and unstaked status may participate.
- Minimum historical uptime: 97% (evaluated over the past 30 epochs).
- Governance participation is tracked and affects future privileges.

---

## 2. Voting Mechanisms

| Type of Proposal             | Voting Threshold        | Locking Requirement |
|------------------------------|-------------------------|---------------------|
| Protocol Upgrade             | 2/3 Majority            | 5,000 ARO           |
| Parameter Adjustment         | Simple Majority         | 1,000 ARO           |
| Node Slashing Appeal         | Weighted by Stake Power | No Lock             |
| Treasury Grant               | 3/5 Majority            | 2,000 ARO           |

- Voting is conducted via signed transactions on-chain.
- Delegated voting is supported through staking delegation contracts.

---

## 3. Proposal Lifecycle

1. **Draft Submission** – Node creates proposal with technical rationale.
2. **Community Review** – Optional off-chain discussion (7 days).
3. **On-Chain Vote** – Finalized proposal enters blockchain voting.
4. **Enforcement** – If passed, smart contracts execute the outcome.

---

## 4. Governance Power Scaling

- Node voting power = √(staked ARO + reputation score)
- Long-term engagement increases influence weight.
- Abusive voting behavior reduces future governance access.

---

## 5. Conflict Resolution

- Governance decisions can be challenged via quorum call (≥15% of nodes).
- Emergency override votes require 75% supermajority.
- Disputes escalated to `All-Seeing Eye` for arbitration (if enabled).

---

## ✅ Checklist

- [ ] Governance smart contracts deployed and synced
- [ ] Voting UI and dashboard available
- [ ] Node reputation registry activated
- [ ] Community review tooling integrated
```

---