# Transaction TTL and Expiration

TTL prevents stale transactions from executing after market or policy conditions change.

## Policy

- Default TTL of 24 hours, adjustable per transaction type.
- High-risk transactions require shorter TTL (e.g., 2 hours).
- Expired transactions moved to archival storage for reference.

## Enforcement

Queue handler checks TTL before validation. NodeChain rejects batches containing expired transactions.
Auditors can review expired transactions for suspicious patterns.
