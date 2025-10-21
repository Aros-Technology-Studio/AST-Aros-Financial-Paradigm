# Token Distribution Model

Distribution ensures minted ARO reaches intended stakeholders while preserving liquidity balances and
policy constraints.

## Distribution Buckets

- **Validator Rewards**: Calculated via NodeChain metrics and processed automatically each epoch.
- **Ecosystem Grants**: Issued upon governance approval with milestone tracking.
- **Treasury Reserves**: Maintained for strategic initiatives and regulatory capital.
- **Supervisory Funds**: Support compliance monitoring, audits, and AI retraining.

## Allocation Algorithm

1. **Determine Pool Sizes** using percentages defined in the Coin Engine token spec.
2. **Apply Dynamic Adjustments** based on reserve utilisation, volatility indicators, and governance
mandates.
3. **Queue Instructions** for each beneficiary vault with lock schedules and metadata.
4. **Execute and Record** using the Processing Layer to guarantee ordering and traceability.

## Liquidity Considerations

- **Smoothing Buffers**: Distribution includes smoothing to avoid sudden liquidity shocks.
- **Buy-Back Integration**: Value Circulation may offset distribution with buy-backs when market
conditions warrant.
- **Fiat Offsets**: For regulators requiring fiat equivalents, the Bridge Layer automates conversion and
reporting.

## Transparency

Weekly distribution reports detail allocations, adjustments, and outstanding commitments. Historical
data is accessible for compliance audits and ecosystem analytics.
