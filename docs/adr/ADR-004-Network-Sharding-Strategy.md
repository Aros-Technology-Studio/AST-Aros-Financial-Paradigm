# ADR-004: Network Sharding Strategy
**Status:** Accepted

## Context
The AST Platform is required to support institutional-grade transaction volume, which will far exceed the capacity of a traditional, monolithic blockchain. A single-threaded execution environment creates a performance bottleneck, limiting throughput (TPS) and increasing latency. To function as a high-performance "Swiss Watch," the platform must be able to scale horizontally.

## Decision
We will implement a **State and Transaction Sharding model** (based on `transaction_sharding_logic.md`).

The core AST network (`Nodechain Engine`) will be partitioned into multiple logical sub-networks called "Shards."

1.  **State Partitioning:** The global ledger state is split across all shards. Each `Shard Node` is responsible only for processing and storing the state for its assigned shard.
2.  **Parallel Processing:** Transactions are batched (`tx_batching_and_sharding.md`) and routed to their respective shards based on their "shardId" (defined in `transaction.schema.json`). This allows multiple shards to process transactions in parallel.
3.  **Local Consensus:** Each shard achieves consensus semi-independently using the quorum protocol defined in `ADR-001`.
4.  **Cross-Shard Communication:** A global finalization layer and dedicated "InterShard Gateway" (implied by `network_consensus_model.md`) will be responsible for finalizing transactions that move value between shards.

## Consequences

**Positive:**
* **High Throughput:** Parallel processing dramatically increases the total Transactions Per Second (TPS) capacity of the network.
* **Horizontal Scalability:** Network capacity can be increased in the future by adding more shards, rather than requiring every node to become more powerful.
* **Lower Node Requirements:** `Shard Nodes` do not need to store the entire global state, making them cheaper and more accessible to run.

**Negative / Trade-offs:**
* **Increased Complexity:** Sharding is significantly more complex than a monolithic chain. The logic for cross-shard communication is a known hard problem in computer science.
* **New Attack Vectors:** The InterShard Gateway creates a new potential attack surface. A failure or exploit in this communication layer could lead to state inconsistency.
* **"Hot Shard" Problem:** If one application or asset becomes extremely popular, its "home shard" could become a performance bottleneck, negating some benefits of sharding.
