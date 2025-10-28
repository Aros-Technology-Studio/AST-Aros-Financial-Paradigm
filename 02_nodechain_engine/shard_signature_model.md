# Shard Signature Model

## 🎯 Purpose of This Document

This document defines the model by which each transaction shard is signed, authenticated, and cryptographically linked to the overall transaction. It ensures integrity, trust, and traceability of each fragment within the NodeChain environment.

---

## 🧩 Core Objectives

1. Ensure **cryptographic integrity** of each transaction shard.
2. Bind **each signature** to its corresponding shard and originator.
3. Prevent **tampering or substitution** of shards within a transaction.
4. Define **multi-node signing quorum** logic.

---

## 🔐 Shard Signature Structure

Each shard is signed using ECDSA or PQ-safe algorithm (configurable).

```json
{
  "shard_id": "sh-A",
  "shard_hash": "0x48d7...",
  "signed_by": "node_003",
  "signature": "0xabc1...",
  "timestamp": "2025-06-23T18:17:00Z",
  "signature_type": "ecdsa_secp256k1"
}
```

---

## **🧬 Signature Lifecycle**

```
sequenceDiagram
    participant T as Transaction Router
    participant N1 as Node 1
    participant N2 as Node 2
    participant G as Gateway

    T->>N1: Send Shard A
    T->>N2: Send Shard B
    N1->>N1: Sign Shard A
    N2->>N2: Sign Shard B
    N1-->>G: Submit Signature A
    N2-->>G: Submit Signature B
    G->>G: Verify quorum
    G->>T: Return signed proof bundle
```

---

## **🧾 Multi-Signature Verification**

- A minimum of n >= 3 node signatures is required for quorum.
- Gateway aggregates all signatures into a **shard proof bundle**.
- Shard hash and signature are **embedded** into the final transaction record.

---

## **🧪 Signature Hashing Formula**

```
shard_hash = SHA-256(shard_content + shard_id + node_nonce)
signature = sign_private_key(shard_hash)
```

Each signature is unique per validator node and per shard instance.

---

## **🚨 Invalid Signatures**

- If a node submits an invalid signature:
    - It is **immediately blacklisted** for the current session.
    - Alert is logged in the audit_layer.
    - Shard is reassigned to a fallback node.

---

## **📁 Repository Location**

```
ast/
└── 02_nodechain_engine/
    └── shard_signature_model.md
```
