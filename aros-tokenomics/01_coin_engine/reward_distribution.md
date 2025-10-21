# Reward Distribution

Reward distribution aligns validator performance, ecosystem development, and treasury sustainability.
Rewards are minted through the emission engine and disbursed according to deterministic allocation
formulas.

## Allocation Buckets

- **Validator Rewards (50%)**: Distributed according to PoT scores, uptime, and participation in
audited batches.
- **Ecosystem Incentives (20%)**: Funds grants, liquidity programs, and developer rewards approved by
governance.
- **Treasury Reserves (20%)**: Builds long-term strategic reserves and ensures regulatory capital
compliance.
- **Supervisory and Compliance (10%)**: Supports continuous auditing, AI oversight, and legal
reporting costs.

## Validator Distribution Mechanics

1. **Score Normalisation**: At epoch end, each validator’s PoT score, latency percentile, and slashing
history are normalised.
2. **Weight Calculation**: Weights combine 60% PoT, 25% uptime, 10% latency, and −25% penalty for any
active warnings.
3. **Payout Execution**: Distribution transactions are sequenced by the Processing Layer with
multi-signature validation from the Supervisory Layer.
4. **Reward Locking**: Rewards enter a 14-day soft lock to discourage immediate sell pressure. Early
unlock requires burning 5% of the reward amount.

## Ecosystem and Treasury Streams

Ecosystem incentives flow through milestone-based contracts. Disbursements release only after proof of
progress is notarised by governance delegates. Treasury reserves are invested according to a policy
that balances liquid assets, low-risk yield instruments, and strategic holdings of partner tokens.

## Transparency

Monthly distribution summaries are published, detailing weights, recipients, unlock schedules, and any
penalties applied. Auditors can replay the distribution logic using the open-source economic
simulation scripts to ensure fairness and compliance.
