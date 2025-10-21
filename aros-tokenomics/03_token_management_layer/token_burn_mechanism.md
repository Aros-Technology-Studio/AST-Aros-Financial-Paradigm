# Token Burn Mechanism

Burning removes ARO from circulation to stabilise supply and enforce penalties.

## Burn Triggers

- **Fee Recycling**: Automatic burn of a percentage of transaction fees.
- **Volatility Control**: Supervisory-directed burns when market metrics exceed thresholds.
- **Penalty Enforcement**: Slashing events and compliance breaches result in burns of collateral.
- **Governance Actions**: Treasury or council initiated burns following public consultation.

## Execution Flow

1. **Trigger Detection**: Rule engine identifies events requiring burn.
2. **Calculation**: Amount determined based on policy parameters and available balances.
3. **Approval**: High-impact burns require supervisory co-signature.
4. **Transaction**: Burn executed on-chain with event emission to audit logs.

## Reporting

Monthly burn reports detail rationale, amounts, and remaining supply. Public dashboards share key
figures while sensitive investigations remain confidential until resolved.
