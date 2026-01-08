# governance_auditability.md

## 1. Purpose

This document outlines the auditability architecture of the AST Governance Layer. It ensures that **every governance action**, including proposals, votes, permissions, and emergency responses:

- Leaves a verifiable cryptographic trail
- Is exportable for third-party auditing
- Cannot be tampered with post-facto
- Supports time-anchored system accountability

---

## 2. Audit Strategy

Auditability in AST is achieved through:

| Method                     | Description                                                           |
|----------------------------|------------------------------------------------------------------------|
| 🔗 On-chain Logging        | All critical actions are written to immutable smart contract logs      |
| 🧾 Merkle Tree Snapshots   | Periodic state hashing for entire governance DB                        |
| 🔍 IPFS References         | Optional proposal data stored off-chain with content hash verification |
| 🕵️ Role Action Tracking    | Every role grant, vote, freeze, or veto has a hashed trace             |
| ⏱ Timestamp Anchoring     | All actions are time-anchored via UTC snapshot time and sequence number |

---

## 3. Core Logging Contracts

| Contract Name             | Purpose                                                                 |
|---------------------------|-------------------------------------------------------------------------|
| `GovernanceLedger`        | Stores all proposal, vote, and status change events                     |
| `PermissionsRegistry`     | Tracks role assignments and revocations                                |
| `EmergencyResponseLog`    | Records all freeze/veto events with structured justification            |
| `AuditExportInterface`    | Provides exportable views of governance history in JSON, CSV formats    |

---

## 4. Merkle Snapshot System

Every 24 hours, a full Merkle tree is built over:

- Proposal registry
- Voter ledger
- Role assignments
- Delegation links

The Merkle root is:

- Stored on-chain
- Anchored in a public timestamp contract
- Optionally cross-posted to IPFS for external proofs

This enables **efficient zero-knowledge inclusion proofs** for any governance action.

---

## 5. IPFS-Linked Content Verification

If a proposal contains extensive off-chain content:

- The proposer must submit a SHA-3 hash of the IPFS document
- This hash is stored alongside the proposal metadata
- Any mismatch invalidates the proposal

This guarantees **content immutability without excessive gas costs**.

---

## 6. Vote Audit Logs

Each vote cast is stored with:

```json
{
  "voter": "0x123...",
  "proposalId": 312,
  "choice": "yes",
  "weight": 150,
  "timestamp": 1731924567,
  "hash": "0xabc123..."
}
```

Auditors can verify:

- Vote authenticity via signature replay
- Vote inclusion via Merkle proof
- No post-hoc manipulation

---

## 7. External Audit API

Auditors or independent nodes can access governance history via:

```
GET /api/governance/votes?proposalId=312
GET /api/governance/roles?user=0xABC
GET /api/governance/emergency-log?from=block123456

```

Access is rate-limited and cryptographically signed.

---

## 8. Integrity Guarantees

| Guarantee | Enforcement Mechanism |
| --- | --- |
| Tamper-proof logs | Smart contract emit + external anchors |
| Proposal immutability | IPFS hash and submission lock-in |
| Role traceability | PermissionsRegistry + Merkle snapshot |
| Vote validation | Weighted snapshot + Merkle inclusion proof |
| Emergency proof trail | Freeze/veto signatures stored + logged |

---

## 9. Summary

Auditability is not a luxury — it's the **backbone of decentralized legitimacy**.

AST governance is designed so that **every action can be verified, disputed, or defended** — cryptographically, procedurally, and historically.

---
