# validator_staking_rules.md (1)

---

```markdown
# validator_staking_rules.md

## 🎯 Purpose

This document outlines the complete set of rules and requirements for validator node staking within the AST network. It defines who can stake, how staking works, reward logic, slashing conditions, and contract behavior in edge scenarios.

---

## 1. Staking Eligibility

- Only authenticated nodes with verified public identity can stake.
- KYC/identity rules may apply if configured by governance layer.
- Nodes must maintain consistent uptime and performance to remain eligible.

---

## 2. Staking Mechanism

| Parameter             | Value / Behavior                            |
|-----------------------|---------------------------------------------|
| Minimum Stake         | 10,000 ARO                                  |
| Lock Period           | 90 days (non-withdrawable)                  |
| Reward Accrual        | Per validated transaction batch             |
| Reward Pool Source    | Node Incentive Pool                         |
| Early Withdrawal Penalty | 15% (burned)                              |

- Stake is locked in a dedicated smart contract.
- Unlock requests are queued and delayed for 7 days before execution.

---

## 3. Reward Model

- Validators receive:
  - Proportional share of transaction fees
  - Fixed node operation bonus (optional, governance-toggled)
- Rewards are automatically credited every epoch (default: 24h).
- Unclaimed rewards roll over and compound within the validator wallet.

---

## 4. Slashing Conditions

| Violation Type            | Penalty                                  |
|---------------------------|-------------------------------------------|
| Double Signing            | 100% stake slashed + permanent ban       |
| Downtime > X% (per epoch) | Warning → Slashing after 3 epochs        |
| Manipulated vote patterns | 50% slashed + cooldown                   |

- All slashing actions are validated through on-chain evidence and consensus.
- Appeals can be submitted via governance dispute resolution.

---

## 5. Re-Staking & Compounding

- Validators can choose to:
  - Re-stake their rewards (auto-compounding)
  - Withdraw to wallet (subject to cooldown)
- Compound cycles reset lock-period timer if used.

---

## 6. Validator Exit & Replacement

- Voluntary exits require:
  - 14-day notice
  - Active slashing review clearance
- Replaced nodes can be:
  - Voted out by quorum
  - Slashed and force-unregistered via consensus

---

## ✅ Checklist Before Activation

- [ ] Staking contract deployed and audited
- [ ] Slash monitor modules synced with validator registry
- [ ] Governance hooks in place for KYC and node policy
- [ ] Validator UI dashboard active
```

---