# ADR-001: Network Consensus Model
**Status:** Accepted

## Context
The AST (Aros Studio) Platform is designed for institutional and governmental use, requiring a multi-shard node architecture. This architecture must provide high security, efficiency, robust fault tolerance, and verifiable integrity. Standard Proof-of-Work (PoW) is too energy-intensive. Standard Proof-of-Stake (PoS) can lead to centralization and is not optimized for validating computational *processing*. We required a novel approach tailored for verifying transaction processing units across a sharded network.

## Decision
We will implement a **delegated, asynchronous proof-of-processing protocol**.

This model is defined by the following key characteristics (based on `network_consensus_model.md`):

1.  **Three Node Roles:** The network is comprised of:
    * **Validator Nodes:** Authenticate transactions and participate in consensus.
    * **Shard Nodes:** Process specific ledger partitions (shards).
    * **Observer Nodes:** Passively audit chain state and contribute to node reputation scoring.

2.  **Weighted Quorum Voting:** Consensus is not based on stake, but on verified participation. Decisions are reached via weighted quorum voting within each shard.
    * A quorum is valid if **≥ 67%** of active validator nodes agree on a proposed state.
    * Voting weights are assigned based on **recent participation rate** and **historical consistency**, not token holdings.

3.  **Identity & Reputation:** Sybil resistance is achieved via **Identity-Locked Node Admission** and a reputation scoring system that penalizes erratic nodes.

4.  **Shard-Level Consensus:** Each shard operates semi-independently, achieving local consensus first before escalating to a global finalization layer.

## Consequences

**Positive:**
* **High Security:** The model is designed to tolerate up to **1/3 Byzantine faults** per shard. The identity-locked admission provides strong Sybil resistance.
* **Efficiency:** Payments are distributed based on *actual computational contribution* (processing) rather than just capital stake, aligning incentives with network work.
* **Scalability:** The multi-shard architecture allows for parallel processing, and the asynchronous nature of the consensus supports this design.
* **Auditability:** All votes are cryptographically signed and stored in the **Shard Signature Log**, providing a clear audit trail for regulators.

**Negative / Trade-offs:**
* **Complexity:** This model is more complex to implement than standard PoS due to the multi-shard logic, weighted voting, and reputation scoring.
* **Dependency on Identity:** The model's security relies heavily on the "Identity Attestation" and "Cryptographic Onboarding" process being robust.
* **Time-Sync Requirement:** The deterministic clock sync protocol is critical for leader rotation. A failure in time-sync could trigger fallback scenarios.
