# Transaction Sharding Logic

The NodeChain uses adaptive sharding to balance performance, data residency, and regulatory
constraints. Shards are logical partitions mapped to validator cohorts and geographic regions.

## Partitioning Strategy

- **Activity-Based Segmentation**: Transactions are grouped by economic domain (retail, enterprise,
public sector) to facilitate differentiated compliance workflows.
- **Jurisdictional Mapping**: Each shard aligns with legal jurisdictions to respect data residency and
reporting obligations.
- **Load Balancing**: Machine learning models forecast transaction throughput and adjust shard weights
in real time to prevent congestion.

## Assignment Workflow

1. **Classification**: Incoming transactions receive tags from the Processing Layer indicating region,
service tier, and compliance profile.
2. **Routing Decision**: The sharding orchestrator consults the classification matrix, validator
availability, and risk metrics to choose a shard.
3. **Batch Packaging**: Transactions are packaged into micro-batches, signed, and sent to shard leaders
for PoT validation.
4. **Rebalancing**: If shard performance degrades, workloads are rebalanced with minimal state transfer.

## State Management

- **Cross-Shard Communication**: Inter-shard dependencies (e.g., multi-region liquidity flows) use
optimistic locking with fallback to supervisory mediation.
- **State Snapshots**: Periodic snapshots enable rapid recovery and auditing, with hashes recorded in
the decentralized transaction encoding layer.
- **Failover**: Standby validators maintain synchronised state to allow quick takeover during faults.

## Security Considerations

- **Collusion Resistance**: Shard assignments rotate regularly to reduce collusion risk.
- **Anomaly Alerts**: AI agents monitor shard-specific anomalies such as unusual latency or correlated
failure patterns.
- **Data Confidentiality**: Sensitive data is encrypted per shard with keys escrowed by compliance HSMs.
