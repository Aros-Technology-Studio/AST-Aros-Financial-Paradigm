# Transaction Execution Contexts

Execution contexts provide deterministic environments for smart contract execution.

## Context Types

- **Standard**: Default context for most transactions.
- **Restricted**: Enhanced compliance checks for high-risk operations.
- **Simulation**: Dry-run contexts for testing and forecasting (see tx_simulation_mode).

## Isolation

Contexts run in sandboxed environments to prevent cross-transaction interference. Resource limits
(CPU, memory, storage) enforced per context.

## State Access

Read/write permissions controlled via capability tokens. Auditable logs record state changes per
context.
