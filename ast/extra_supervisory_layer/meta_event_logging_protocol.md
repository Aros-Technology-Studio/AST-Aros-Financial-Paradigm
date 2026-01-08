# Meta Event Logging Protocol

## 1. Purpose

This document defines the protocol by which **The All-Seeing Eye** logs observed events, anomalies, and integrity signals. The logging system guarantees immutability, timestamping, and long-term verifiability for all records, without influencing runtime behavior.

---

## 2. Logging Model

All observations are logged as **event objects**, signed and recorded in a **read-only oversight ledger**.

Each event must contain:

```json
{
  "event_id": "EVT-548292",
  "timestamp": 1731942217,
  "type": "anomaly_detected",
  "source": "execution_queue",
  "payload": {
    "anomaly_id": "EXE-102",
    "hash": "0xa7f23b...",
    "severity": "high"
  },
  "signature": "0xfeedbeef..."
}
```

---

## 3. Storage Architecture

Logs are written to a **dedicated Immutable Oversight Ledger**, implemented as:

- **Append-only** Merkle-linked chain
- IPFS-mirrored logs (optional external anchoring)
- On-chain anchoring (daily digest hash)
- Queryable by authorized Observer Nodes

---

## 4. Event Types

| Type | Description |
| --- | --- |
| `anomaly_detected` | Registered pattern deviation |
| `scope_violation` | Attempted access outside allowed metadata domain |
| `heartbeat` | Regular activity pulse (keepalive signal) |
| `integrity_signal` | Protocol conformance ping or passive alert |
| `observer_join` | Observer node has subscribed |
| `observer_exit` | Observer node has unsubscribed |

---

## 5. Signing Logic

Each log entry is:

- Signed using the Eye’s private audit key
- Optionally co-signed by a quorum of Observer Nodes
- Verified during retrieval via digital signature validation

This ensures **non-repudiability** and **proof of origin**.

---

## 6. Logging Frequency & Limits

| Event Type | Frequency Cap |
| --- | --- |
| anomaly_detected | Max 10 per snapshot/batch |
| heartbeat | Once per 5 snapshots |
| observer_join | Once per session |
| integrity_signal | Rate-limited to 1/minute |

Overflow entries are dropped with `rate_limited=true` tag in debug log.

---

## 7. Privacy Policy

The Eye does not log:

- Wallet addresses
- User identifiers
- Raw transaction data
- Execution context internals

Only derived metadata is ever recorded.

---

## 8. Query Protocol

Observer Nodes can request logs via signed API or filtered snapshots.

```
GET /eye/logs?type=anomaly_detected&from=snapshot_120000
GET /eye/logs?event_id=EVT-548292
```

Access is restricted to nodes registered via `observer_node_interface.md`.

---

## 9. Summary

Logging is the Eye’s only output.

It cannot act — only **witness and write**.

The Meta Event Logging Protocol ensures that every anomaly, every drift, and every heartbeat is preserved for audit, validation, and historical traceability.
