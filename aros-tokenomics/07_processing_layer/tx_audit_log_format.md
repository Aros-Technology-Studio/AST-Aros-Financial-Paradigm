# Transaction Audit Log Format

Audit logs provide standardised records for regulators and auditors.

## Fields

- Transaction ID and hash
- Timestamp (UTC)
- Actor IDs and roles
- Validation outcomes and reason codes
- Compliance references
- State changes (hashed)

## Compliance

Logs comply with ISO 20022 metadata mapping for cross-institution reporting. Retention follows
regulatory requirements with encrypted backups stored off-site.
