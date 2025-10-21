# Transaction Dispatch Engine

The dispatch engine sequences validated transactions into shard batches for NodeChain processing.

## Functions

- Aggregates validated transactions by shard key.
- Optimises batch size based on network load and latency targets.
- Ensures ordering guarantees for dependent transactions.
- Publishes batch manifests with cryptographic commitments.

## Failures

If dispatch fails, transactions re-enter the queue with failure reason. Supervisory alerts trigger when
failure rate exceeds thresholds.
