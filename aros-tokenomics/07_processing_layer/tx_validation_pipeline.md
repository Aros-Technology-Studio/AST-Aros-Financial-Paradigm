# Transaction Validation Pipeline

Validation ensures transactions meet policy, compliance, and technical requirements before execution.

## Stages

1. **Schema Validation**: Confirm structure and metadata.
2. **Compliance Checks**: Run KYC/AML, sanctions, and travel rule verifications.
3. **Business Logic**: Execute smart contract preconditions and risk scoring.
4. **Fee Confirmation**: Validate fee sufficiency and burn/rebate instructions.
5. **Consensus Preparation**: Tag transactions with shard routing metadata.

## Tooling

Validation pipeline implemented as deterministic microservices with reproducible builds and versioned
configuration. AI modules provide risk scores but final decision remains deterministic.
