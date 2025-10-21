# Reverse Tokenization Bridge

Reverse tokenization enables redemption of wrapped assets back to their original form.

## Process

1. **Redemption Request**: User submits request with compliance identifiers.
2. **Verification**: Confirm ownership, check sanctions list, and validate asset availability.
3. **Settlement**: Release underlying asset through custodial partner, updating on-chain supply.
4. **Reporting**: Log activity for regulatory audits and adjust reserve records.

## Risk Controls

- Redemption limits per entity and per time window.
- Custodial partners must maintain realtime proof-of-reserve attestations.
- AML checks for unusual redemption patterns.

## User Experience

Transparent dashboards show status of redemption, expected settlement times, and fees. Support teams
handle exceptional cases with governance oversight.
