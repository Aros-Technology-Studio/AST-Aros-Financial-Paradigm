# Token Lock and Unlock Rules

Locking mechanisms ensure responsible liquidity management and discourage short-term speculation.

## Lock Types

- **Validator Reward Locks**: 14-day rolling locks with optional early unlock at burn cost.
- **Grant Vesting**: Customisable cliffs and vesting curves tied to milestone deliverables.
- **Compliance Holds**: Automated holds for addresses under review or flagged by AML checks.

## Unlock Conditions

1. **Time-Based**: Lock expires after the predetermined period, releasing tokens automatically.
2. **Milestone-Based**: Unlock triggered by governance-approved verification of deliverables.
3. **Manual Override**: Governance council can authorise unlocks for exceptional cases, recorded with
full justification.

## Enforcement

- **Smart Contract Enforcement**: Lock state encoded on-chain prevents transfers until conditions met.
- **AI Monitoring**: Agents monitor attempted bypasses and escalate suspicious patterns.
- **Audit Trails**: Every lock/unlock event is logged with metadata, including reason codes and
associated governance decisions.

## Emergency Freezes

During critical incidents, the Supervisory Layer can freeze specific vaults or addresses. Freezes
require retrospective governance review within 72 hours to remain active.
