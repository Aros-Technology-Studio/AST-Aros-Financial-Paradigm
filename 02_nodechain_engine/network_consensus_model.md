# network_consensus_model.md

## Purpose of This Document

This document defines the consensus mechanism used within the Aros NodeChain (AST Layer). It outlines how decentralized nodes agree on transaction validity, batch finalization, and overall NodeChain transaction sequencing. The model is tailored for the Aros environment, balancing security, efficiency, and modular scalability.

---

## Document Structure

1. **Consensus Overview**
2. **Node Roles and Types**
3. **Voting and Quorum Logic**
4. **Time-Sync and Leader Rotation**
5. **Shard-Level Consensus**
6. **Attack Mitigation Strategies**
7. **Fault Tolerance and Recovery**
8. **Future Extensions and Forkability**
9. **Appendix: Diagrams and Examples**

---

## 1. Consensus Overview

The Aros consensus model is a **delegated, asynchronous proof-of-processing protocol** built to ensure transaction integrity across a **multi-shard node architecture**. Unlike PoW or PoS, it operates on **verified transaction processing units**, with payments dynamically distributed based on actual computational contribution.

---

## 2. Node Roles and Types

There are three primary node types:

- **Validator Nodes**: Authenticate transactions and participate in consensus.
- **Shard Nodes**: Process specific partitions of the ledger.
- **Observer Nodes**: Passive nodes that audit chain state and contribute to reputation scoring.

Each node must undergo an admission procedure, cryptographic onboarding, and identity attestation.

---

## 3. Voting and Quorum Logic

Consensus decisions are reached through **weighted quorum voting**. Each shard maintains its own voting ring:

- A quorum is considered valid if **≥ 67%** of active validator nodes agree on a proposed transaction state.
- Voting weights are assigned based on **recent participation rate** and **historical consistency**.

All votes are cryptographically signed and stored in the **Shard Signature Log** (see `shard_signature_model.md`).

---

## 4. Time-Sync and Leader Rotation

A deterministic **clock sync protocol** ensures that validator windows are aligned. Leader nodes are rotated on a round-robin basis every **X epochs**, with fallback logic in case of non-response or timeout.

Time discrepancies above a certain threshold automatically initiate a **fallback leader swap**.

---

## 5. Shard-Level Consensus

Each shard operates semi-independently. Transactions are first validated within their shard before being escalated to **cross-shard propagation** via the **InterShard Gateway**.

Consensus is achieved both at:

- **Local Shard Level** — using quorum-based voting
- **Global Finalization Layer** — using asynchronous commitment agreement

---

## 6. Attack Mitigation Strategies

Aros employs the following mechanisms:

- **Sybil Resistance** via Identity-Locked Node Admission
- **Double-Spending Protection** at both local and global levels
- **Consensus Lock Timeout**, after which the system switches to emergency mode
- **Reputation Scoring System** that penalizes erratic nodes and boosts honest validators

---

## 7. Fault Tolerance and Recovery

- System tolerates up to **1/3 Byzantine faults** per shard.
- In the event of node failure, votes are rebalanced via **Quorum Rebalancer Engine**.
- **Checkpointing Protocol** persists full shard states every N snapshots for rollback and recovery.

---

## 8. Future Extensions and Forkability

This model supports:

- Pluggable consensus algorithms per shard in future forks
- Quantum-safe signature upgrades
- Migration paths to hybrid AI-consensus augmentations

---

## 9. Appendix: Diagrams and Examples

(Markdown/mermaid diagrams will be added later manually.)
