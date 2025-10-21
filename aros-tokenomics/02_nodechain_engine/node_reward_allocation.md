# Node Reward Allocation

Validator rewards are calculated using metrics surfaced by the NodeChain. Allocation is tied to
performance, compliance, and community contributions.

## Inputs

- **PoT Contribution**: Number of verified transactions processed and attestation accuracy.
- **Operational Reliability**: Uptime, latency, and incident history scored by AI agents.
- **Compliance Score**: Quality of KYC reviews, adherence to reporting deadlines, and absence of
sanctions.
- **Community Participation**: Engagement in governance proposals and mentorship programmes.

## Calculation Steps

1. **Metric Normalisation**: Each input is scaled to a 0-1 range per epoch.
2. **Weighting**: Weights are applied (PoT 50%, Reliability 25%, Compliance 15%, Community 10%).
3. **Reward Pool Share**: Weighted scores determine proportional share of the validator reward bucket.
4. **Adjustments**: Penalties for unresolved incidents or supervisory warnings reduce the final payout.

## Distribution Controls

- **Soft Lock**: Rewards remain locked for 14 days; early unlock triggers burn penalties.
- **Delegator Split**: Validators can designate how rewards split with delegators, subject to minimums
for fairness.
- **Transparency**: Payouts are published with supporting metrics so delegators and regulators can
verify fairness.

## Continuous Improvement

Quarterly reviews analyse reward outcomes to ensure incentives promote desired behaviour. Governance
can adjust weights or introduce new metrics, such as carbon footprint scores or cross-border
collaboration incentives.
