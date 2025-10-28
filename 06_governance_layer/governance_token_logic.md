# governance_token_logic.md

## 1. Purpose

This document defines the design, behavior, and constraints of the **governance token** used in the Aros Studio Tokenomics (AST) system. It serves as the basis for:

- Proposal submission rights
- Voting power calculation
- Delegation and staking
- Non-monetary utility enforcement

This token is **strictly internal** to the governance layer and is **not tradable** on public or private markets.

---

## 2. Core Principles

| Principle                | Description                                                         |
|--------------------------|---------------------------------------------------------------------|
| 🔒 Non-Transferability   | Tokens cannot be freely transferred between users                   |
| 🪙 Staking-Based Voting  | Governance power is activated only when tokens are staked           |
| 🧾 No Monetary Function  | Token has no exchange value and cannot be sold or swapped           |
| 🧠 Delegation with Limits| Delegation allowed, but capped and revocable                       |
| 🧮 Epoch-Based Rewards   | Tokens may be earned via participation in governance epochs         |

---

## 3. Token Acquisition

Governance tokens can be:

- **Earned** through validated system contributions (e.g. development, validator uptime, proposal authorship)
- **Delegated** temporarily from other verified users
- **Allocated** by governance vote from reward pools

They **cannot be purchased**, claimed via liquidity, or bridged from other systems.

---

## 4. Token Activation

To use tokens for governance actions (vote, propose, delegate), the user must:

1. Lock them in the `GovernanceStakingContract`
2. Maintain eligibility status from Compliance Oracle
3. Wait for snapshot block to complete before activation
```

```solidity
function stake(uint256 amount) external returns (bool);
```

Unstaking is possible only after the active epoch ends, with cooldown period applied.

---

## 5. Delegation Log

Delegation allows governance power to be lent to another user:

```solidity
function delegateTo(address delegatee, uint256 amount) external returns (bool);

```

Constraints:

- Max 20% of a user’s tokens may be delegated
- Delegation must be explicitly revoked to recover power
- Delegated votes are transparent in ledger and cannot be sub-delegated

---

## 6. Token Expiry and Inactivity

Tokens may expire or decay if:

- The holder is inactive for multiple epochs
- The holder is flagged by Compliance Oracle
- A governance decision triggers forced expiration (e.g. proposal sanctions)

Expired tokens are returned to the governance treasury.

---

## 7. Smart Contract Interfaces

```solidity
interface IGovernanceToken {
    function balanceOf(address user) external view returns (uint256);
    function stake(uint256 amount) external returns (bool);
    function delegateTo(address delegatee, uint256 amount) external returns (bool);
    function revokeDelegation(address delegatee) external returns (bool);
}

```

All functions include time-lock protection and snapshot coordination.

---

## 8. Governance Ledger Logging

Each token action is recorded with:

- Timestamp
- Action type (`stake`, `delegate`, `revoke`, `expire`)
- Affected user(s)
- Reference to active proposal (if applicable)
- Unique action hash

This ensures full accountability and replayability.

---

## 9. Integration Points

| Component | Role |
| --- | --- |
| VotingContract | Reads staked balances at snapshot |
| ProposalEngine | Validates `minStakeToPropose` |
| Permissions Registry | Tracks delegate status |
| Governance Treasury | Holds expired and unallocated tokens |
| Compliance Oracle | Can suspend token activity per user |

---

## 10. Next Steps

Now that governance token logic is defined, we continue with:

- `quorum_validation_rules.md`
