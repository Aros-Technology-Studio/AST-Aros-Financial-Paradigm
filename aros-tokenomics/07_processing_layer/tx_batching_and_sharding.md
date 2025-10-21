# Transaction Batching and Sharding

Batching groups transactions into shard-specific bundles for efficient processing.

## Strategy

- Determine shard via jurisdiction, asset type, and risk classification.
- Optimise batch size for latency vs throughput trade-offs.
- Include priority handling for compliance-critical transactions.

## Coordination

Batch coordinator interacts with NodeChain to confirm shard availability and leader assignments. Failed
batches retried with exponential backoff.
