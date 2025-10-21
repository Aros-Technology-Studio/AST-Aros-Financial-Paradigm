# Transaction Execution Guardrails

Guardrails prevent execution anomalies and protect state integrity.

## Controls

- **Gas Limits**: Prevent runaway resource usage.
- **Risk Thresholds**: Halt execution if AI risk score exceeds limit.
- **Dependency Checks**: Ensure prerequisite transactions finalised.
- **Circuit Breakers**: Pause execution for sectors experiencing anomalies.

## Monitoring

Execution metrics aggregated in observability stack. Alerts escalate to operations and supervisors for
manual intervention when required.
