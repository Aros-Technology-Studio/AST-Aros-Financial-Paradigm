# AST Node Infrastructure Specification

## Purpose

Define the architecture, lifecycle, and technical requirements of the decentralized node infrastructure responsible for processing, validating, and securing transactions within AST.

---

## 1. Node Types

| Node Type          | Role Description                                         |
|--------------------|----------------------------------------------------------|
| **Processing Node**| Actively processes transactions and records signed work  |
| **Observer Node**  | Standby node that monitors network health & rotates in   |
| **Bootstrap Node** | Handles cold start of the system                         |
| **Governance Node**| Participates in voting & anomaly detection (optional)    |
| **AI Audit Node**  | Verifies contract compliance and audit trails            |

---

## 2. Node Requirements

### a. Base Software

Each node runs:

- AST Node Daemon (`astd`)
- Encrypted Transport Layer (TLS)
- ARO wallet integration module
- Optional: AI plugin interface

### b. Hardware Requirements

| Resource     | Minimum                      |
|--------------|------------------------------|
| CPU          | 4 vCores                     |
| RAM          | 16 GB                        |
| Storage      | 512 GB SSD                   |
| Network      | >100 Mbps, IPv6 supported    |

---

## 3. Node Lifecycle

```mermaid
graph TD;
  A[Node Registration Request] --> B[Identity Verification];
  B --> C[Register: reputation=1, weight=1, uptime=1];
  C --> D[Node Key Signing];
  D --> E[Start Observing];
  E --> F[Active Processing Role via rotation];
```

---

## 4. Registration

- A node registers with default metrics (`reputation = 1`, `weight = 1`, `uptime = 1`,
  `successes = 0`, `total = 0`) — no ARO deposit or stake is required or held
  (`src/nodes/nodes.service.ts`, `NodesService.register`; invariant I9, prohibitions P1/P2).
- Identity verification generates a node keypair and tokenizes the node ID.
- Registration is recorded as a `node.registered` NodeChain event; the node is admitted to the
  active pool and earns weight purely from subsequent confirmed work.

---

## 5. Rotation Logic

- Rotation interval: every 15 minutes
- Rotation criteria:
  - Node uptime
  - Fault rate
  - Governance score
  - Recent activity
- Implemented via NodeRotationContract

---

## 6. Security Model

- TLS for transport
- Token-signed payloads
- Two-key infrastructure: identity key + signing key
- Tamper logging via The All-Seeing Eye module

---

## 7. Misbehavior Handling

| Violation Type       | Effect on Standing                        |
| -------------------- | ------------------------------------------ |
| Downtime > threshold | Temporary suspension (`status` set inactive) |
| Malicious tampering  | Failed executions lower `reputation`/`weight`, shrinking future payment share (see `10_proof_of_transaction_engine/pot_slashing_conditions.md`) |
| Collusion behavior   | AI-auditor flag → governance vote          |

No penalty confiscates already-earned value or a held balance — nodes hold no stake to seize
(invariant I9, prohibitions P1/P2).

---

## 8. Observability Hooks

- All nodes stream logs to Observer Mesh
- Events monitored:
  - Uptime, load, anomalies
  - Protocol version drift
  - Unauthorized packet patterns

---

## 9. Summary

The AST node network is designed to be modular, secure, auditable, and dynamically adjustable via contracts and governance. Observability and automation ensure zero-trust compliance and scalable participation.
