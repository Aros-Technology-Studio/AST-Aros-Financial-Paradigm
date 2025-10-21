# Vault System Design

Vaults manage ARO liquidity and safeguard reserves for different purposes.

## Vault Types

- **Validator Rewards Vault**: Holds reward allocations before distribution.
- **Ecosystem Development Vault**: Funds grants, partnerships, and incubation programmes.
- **Treasury Reserve Vault**: Maintains strategic reserves, including fiat hedges and stablecoins.
- **Insurance Vault**: Covers slashing penalties and operational incidents.

## Controls

- **Access Policies**: Multi-signature approvals with governance and supervisory representation.
- **Balance Thresholds**: Upper and lower bounds trigger automatic rebalancing or buy-backs.
- **Segregation of Duties**: Different teams manage funding requests, execution, and auditing to prevent
conflicts of interest.

## Infrastructure

Vaults operate on layer-1 smart contracts with optional custodial integration for fiat equivalents.
All vault activity is mirrored into the audit trail and real-time dashboards.

## Security

- Hardware security modules for key management.
- Transaction pre-signing checks by AI anomaly detection.
- Insurance coverage for custodial partners.
