# Transaction Sharding Logic

## 🎯 Purpose of This Document

This document describes the logic and rules for splitting an incoming transaction into discrete, independently processable shards. It defines how transaction data is segmented, encoded, routed to validators, and ultimately reassembled after verification.

---

## 🧩 Core Objectives

1. Establish **sharding rules** for different transaction types.
2. Define **data slicing mechanisms** with privacy preservation.
3. Enable **parallel validation and recombination** of data.
4. Ensure compatibility with **NodeChain validation pools**.
5. Minimize leakage of full transaction visibility to any single node.

---

## 🧪 Input Transaction Format

Incoming raw transaction payload before sharding:

```json
{
  "tx_id": "trx-00392",
  "from": "wallet_a1b2",
  "to": "wallet_c3d4",
  "amount": 210.00,
  "currency": "AROS",
  "timestamp": "2025-06-23T18:10:00Z",
  "memo": "Service subscription",
  "auth_token": "0x6f...9e"
}
```

---

## **🧮 Sharding Scheme**

Transaction fields are assigned to logical partitions:

| **Shard** | **Contents** | **Sensitivity** | **Hash Dependency** |
| --- | --- | --- | --- |
| A | from, amount | High | Yes |
| B | to, currency | Medium | Yes |
| C | timestamp, memo | Low | No |
| D | auth_token, derived hash pointer | High | Yes |

Each shard is encoded, assigned a shard ID, and routed to distinct validation pools.

---

## **🔄 Processing Flow**

```
graph TD
    A[Raw Transaction] --> B[Slice into Shards]
    B --> C[Encrypt each Shard]
    C --> D[Route to Validator Pools]
    D --> E[Shards Signed + Hashed]
    E --> F[Quorum Assembled]
    F --> G[Reconstructed + Confirmed]
```

---

## **🔐 Privacy and Isolation**

- Each shard is **independently encrypted** with per-shard ephemeral keys.
- No validator has access to all shards of a transaction.
- Hash stitching at the gateway ensures authenticity before recombination.

---

## **🚧 Fault Handling**

- If any shard fails validation:
    - The full transaction is **requeued** with a new shard salt.
    - Offending node is **flagged** and may be excluded from quorum temporarily.
    - Gateway logs full trace for audit layer.

---

## **📁 Repository Location**

```
ast/
└── 02_nodechain_engine/
    └── transaction_sharding_logic.md
```
