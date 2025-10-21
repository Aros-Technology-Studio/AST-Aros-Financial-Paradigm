# Encryption Protocol

The encryption protocol secures NodeChain communications, state replication, and stored data. It
combines post-quantum readiness with compliance mandates for key escrow and lawful inspection.

## Transport Security

- **Mutual TLS 1.3** with client certificate pinning ensures only registered validators communicate on
the mesh network.
- **Forward Secrecy** is maintained using hybrid key exchange (ECDHE + Kyber) to prepare for
post-quantum adversaries.
- **Telemetry Channels** are encrypted separately from consensus traffic to isolate monitoring data.

## Data at Rest

- **Sharded State Encryption**: Each shard maintains its own AES-256-GCM key managed by compliance
HSMs. Keys rotate every 30 days or immediately after suspicious events.
- **Vault Data Protection**: Liquidity and staking vaults use double encryption—once by the protocol and
once by custodial partners—to satisfy regulatory requirements.

## Key Management

- **Threshold Signatures**: Critical operations such as emission proofs or bridge attestations require
multi-party computation signatures split between validators and supervisory representatives.
- **Key Escrow**: An escrow authority holds encrypted recovery shares to comply with lawful access
requests. Access requires governance approval and is fully audited.
- **Revocation**: If a validator is compromised, keys are revoked via Certificate Revocation Lists and
post-quantum signatures that prevent replay.

## Compliance & Auditing

All key events—generation, rotation, revocation—are recorded in the Processing Layer audit log.
Cryptographic material is never stored in plaintext in the repository; this document serves as
operational guidance for implementation teams.
