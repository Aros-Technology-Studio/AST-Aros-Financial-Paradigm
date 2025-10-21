# Transaction Failure Modes

Failure modes describe reasons transactions may fail during processing.

## Categories

- **Validation Errors**: Schema mismatch, insufficient fees, policy violation.
- **Compliance Blocks**: AML flag, sanctions match, jurisdiction limit.
- **Execution Errors**: Smart contract revert, gas exhaustion.
- **Operational Issues**: Infrastructure outage, dependency failure.

## Handling

Failures logged with reason codes. Users notified via API responses. Critical failures escalate to
operations team for remediation.
