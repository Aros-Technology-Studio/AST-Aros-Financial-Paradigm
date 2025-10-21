# Transaction Structure and Metadata

Transactions encapsulate business logic, compliance attributes, and routing hints.

## Fields

- **Header**: Timestamp, nonce, originating address, jurisdiction code.
- **Payload**: Smart contract call or asset transfer instructions.
- **Compliance Block**: KYC references, travel rule data, risk scores.
- **Fee Envelope**: Declares fee payer, amount, and burn/rebate instructions.

## Metadata Handling

- Enforced schema validation before acceptance.
- Sensitive data encrypted with jurisdiction-specific keys.
- Metadata versioning ensures backward compatibility during upgrades.

## Auditability

All fields hashed into the audit ledger. Metadata ensures regulators can trace flows without exposing
unnecessary personal information on-chain.
