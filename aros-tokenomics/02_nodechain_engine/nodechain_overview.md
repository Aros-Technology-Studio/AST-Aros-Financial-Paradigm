# NodeChain Overview

The NodeChain Engine coordinates validators, orchestrates sharding, and ensures deterministic finality
for Proof of Transaction. It combines on-chain registries with off-chain orchestration services to
maintain security, performance, and compliance.

## Components

- **Validator Registry**: Stores operator identity, KYC attestations, staking collateral, and hardware
profiles.
- **Sharding Orchestrator**: Assigns transaction batches to shards based on workload, geographic
constraints, and regulatory residency requirements.
- **Consensus Scheduler**: Prioritises nodes for leader or attestation roles using PoT-weighted
randomness.
- **Telemetry Mesh**: Streams performance metrics, anomaly scores, and compliance events to AI agents
and governance dashboards.

## Operational Principles

1. **Deterministic Membership**: Validators are only admitted after compliance approval and AI risk
assessment. Each membership change is notarised for auditors.
2. **Regional Compliance**: Shards enforce data residency and jurisdiction-specific policy, ensuring
transactions are processed where legally permitted.
3. **Resilience**: Redundant orchestration clusters and quorum rotation protect against collusion or
targeted attacks.
4. **Transparency**: Every scheduling decision and shard reassignment is logged, enabling retrospective
audit and dispute resolution.

## Integrations

The NodeChain interacts with:

- **Coin Engine** to supply validator metrics for emission weighting.
- **Processing Layer** to deliver ordered transaction batches.
- **AI Agents** to receive behaviour feedback and apply automated sanctions.
- **Governance Layer** to enforce registration policies, slashing, and upgrades.

## Roadmap Alignment

During the foundation phase the NodeChain runs in simulation mode, graduating to full PoT enforcement
in the controlled launch milestone. Continuous upgrades introduce enhanced anomaly detection, dynamic
sharding, and cross-chain failover capabilities.
