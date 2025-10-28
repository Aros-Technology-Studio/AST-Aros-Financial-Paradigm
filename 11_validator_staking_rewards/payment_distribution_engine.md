# reward_distribution_engine.md (1)

---

```markdown
# 📄 reward_distribution_engine.md

## Module: Reward Distribution Engine
**Layer**: Validator Staking & Reward System — AST (Aros Studio Tokenomics)
**Status**: Production-grade
**Author**: Aros Studio Blockchain Division
**Last Updated**: 2025-07-05

---

## Overview

This module defines the mechanism for calculating and distributing rewards to validators participating in Proof of Transaction (PoT) within AST epochs. The reward engine ensures proportional, fair, and performance-sensitive allocation of emission units.

---

## Reward Composition

| Component                | Description |
|--------------------------|-------------|
| `Base Epoch Reward`      | Fixed emission allocation for each epoch |
| `Stake Weight`           | Validator's stake relative to total active stake |
| `Performance Modifier`   | Score from validator performance engine |
| `Penalty Adjustments`    | Deducted for downtime, fraud, or missed attestations |

---

## Reward Calculation Formula

```text
validator_reward = epoch_(payout|settlement)_pool
                 × (validator_stake / total_stake)
                 × performance_score
                 - penalties

```

- `performance_score` ∈ [0.0, 1.0]
- `penalties` dynamically computed based on epoch audit logs

---

## Distribution Process

```mermaid
sequenceDiagram
    participant E as EpochController
    participant V as Validator
    participant R as RewardEngine
    participant W as WalletContract

    E->>R: triggerRewardDistribution(epoch_id)
    R->>R: calculateAllValidatorRewards()
    R->>V: notifyRewardAmount
    R->>W: commitRewardTransfer(address, amount)
    W-->>V: transferReward()

```

---

## Reward Frequency

| Event | Trigger |
| --- | --- |
| `Epoch End` | Every 7 days (default) |
| `Manual Override` | Governance may issue early or delayed rewards |
| `Emergency Payout` | In case of chain fork recovery |

---

## Penalty Impact

| Violation Type | Impact on Reward |
| --- | --- |
| Missed Attestations | −15% per event |
| Fraudulent Signature | −100%, trigger slashing |
| Downtime > 5% | −30% penalty |
| Metadata Manipulation | Blocked reward |

---

## Reward Types

| Type | Description |
| --- | --- |
| `AROS-Emission` | Standard validator rewards in AROS |
| `Reputation Points` | Non-transferable points for governance rank |
| `Epoch Bonus` | Randomized incentive pools for top performers |

---

## Smart Contract Functions

| Function | Description |
| --- | --- |
| `distributeRewards(epochId)` | Launch reward distribution for the given epoch |
| `getRewardDetails(address)` | View reward breakdown for validator |
| `applyPenalty(address)` | Apply deduction based on audit log |
| `setPerformanceScore(address, score)` | Register validator performance rating |

---

## Data Anchoring

Each reward event is linked to:

- Epoch ID
- Block Height
- Validator ID (VID)
- Node Hash
- JSON Report Snapshot

Sample Report:

```json
{
  "epoch": 3912,
  "vid": "V-00928",
  "reward": 823.71,
  "penalties": 1,
  "final_score": 0.89,
  "tx_hash": "0x09AF...",
  "block": 18200123
}

```

---

## Dependencies

- `validator_epoch_commitments.md`
- `validator_performance_score.md`
- `slashing_and_penalty_rules.md`
- `emission_flow_pipeline.md`

---

## Next

→ See [`validator_performance_score.md`](https://www.notion.so/aros-studio/validator_performance_score.md) to understand how scores are calculated and impact reward allocation.

```

```