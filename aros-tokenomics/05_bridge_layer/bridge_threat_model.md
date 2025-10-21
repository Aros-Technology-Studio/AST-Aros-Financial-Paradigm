# Bridge Threat Model

The bridge faces complex threats due to cross-network dependencies and regulatory exposure.

## Threats

- **Compliance Evasion**: Attempts to bypass KYC/AML checks.
- **Oracle Manipulation**: Feeding incorrect FX or reserve data.
- **Custodial Breach**: Compromise of partner infrastructure.
- **Cross-Chain Replay**: Reusing bridge messages across networks.
- **Insider Collusion**: Coordinated fraud by operators or partners.

## Mitigations

- Multi-factor authentication and behavioural analytics for access control.
- Redundant data sources with threshold signing to validate oracle updates.
- Insurance coverage and proof-of-reserve attestation for custodial partners.
- Nonces and chain-specific tags to prevent replay.
- Independent oversight and mandatory vacations for staff in sensitive roles.

## Monitoring

Real-time analytics track anomalies, with alerts escalating to Supervisory and Governance bodies for
rapid intervention.
