# Transaction Hash Map Index

The hash map index accelerates lookups for transaction data.

## Design

- Stores mapping from transaction hash to storage location and metadata pointers.
- Utilises sharded key-value stores for scalability.
- Supports multi-tenant namespaces for regulators and internal teams.

## Consistency

Index updates occur atomically with journal writes. Background tasks verify integrity and repair
inconsistencies.
