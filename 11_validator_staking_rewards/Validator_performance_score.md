# Validator_performance_score.md 

## Module: Validator Performance Score
**Layer**: Validator Staking & Reward System — AST (Aros Studio Tokenomics)
**Status**: Production-grade
**Author**: Aros Studio Blockchain Division
**Last Updated**: 2025-07-05

---

## Overview

This document outlines the design and mechanics of the performance scoring system for validators in the AST network. Validator scores directly impact reward multipliers, penalty thresholds, and future epoch eligibility.

The scoring engine evaluates objective performance metrics during each epoch and produces a final performance score ranging from 0.00 to 1.00 for every validator.

---

## Scoring Factors

| Factor                        | Weight (%) | Description |
|-------------------------------|------------|-------------|
| `Uptime Ratio`                | 25%        | Active node availability within epoch |
| `Attestation Accuracy`        | 30%        | Rate of valid attestations to total submissions |
| `Latency Index`               | 15%        | Response time compared to epoch average |
| `Fraud Signal Penalties`      | 20%        | Negative score from NodeChain or Governance audits |
| `Finalization Participation`  | 10%        | Ratio of participation in finalization rounds |

---

## Score Formula

```text
score = 0.25·U + 0.30·A + 0.15·L + 0.10·F + 0.20·(1 − P)

```

Where:

- U = Uptime Ratio
- A = Attestation Accuracy
- L = Normalized Latency
- F = Finalization Participation
- P = Fraud Signal Coefficient (0 = clean, 1 = flagged)

All inputs are normalized on a 0.00–1.00 scale.

---

## Score Tiers and Outcomes

| Score Range | Label | Reward Multiplier | Slashing Risk |
| --- | --- | --- | --- |
| 0.90–1.00 | ✅ Excellent | 1.10× | Very low |
| 0.75–0.89 | 👍 Good | 1.00× | Low |
| 0.50–0.74 | ⚠️ Fair | 0.80× | Medium |
| 0.30–0.49 | 🚫 Weak | 0.50× | High |
| < 0.30 | ❌ Critical | 0× (No reward) | Immediate Slash |

---

## Sample Output

```json
{
  "validator": "V-00192",
  "epoch": 2187,
  "score": 0.86,
  "tier": "Good",
  "breakdown": {
    "uptime": 0.91,
    "attestations": 0.88,
    "latency": 0.63,
    "finalization": 0.82,
    "fraudSignal": 0.0
  },
  "slashing_risk": "Low",
  "reward_multiplier": 1.00
}

```

---

## Smart Contract Hooks

| Function | Purpose |
| --- | --- |
| `submitPerformanceScore(address, epoch, score)` | Store score to validator record |
| `getValidatorScore(address)` | Retrieve last known score |
| `updateScoreInputs(address, data)` | Feed raw metrics into scoring model |

---

## Governance Influence

- Validators with >3 low scores in 10 epochs may be suspended
- High-performing validators may earn bonus slots or unlock staking benefits
- Score weights are adjustable via governance vote

---

## Dependencies

- `reward_distribution_engine.md`
- `validator_epoch_commitments.md`
- `slashing_and_penalty_rules.md`

---

## Next

→ See [`slashing_and_penalty_rules.md`](https://www.notion.so/aros-studio/slashing_and_penalty_rules.md) to understand how low scores trigger penalties and when governance overrides can apply.

```

```
