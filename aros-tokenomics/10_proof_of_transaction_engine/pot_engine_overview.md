# Proof of Transaction Engine Overview

The PoT Engine verifies and scores validator contributions based on transaction processing quality.

## Responsibilities

- Collect attestation data from NodeChain shards.
- Compute PoT scores factoring accuracy, throughput, and compliance adherence.
- Publish scores for reward distribution and consensus weighting.
- Detect anomalies and trigger challenges when needed.

## Architecture

- **Data Collector**: Aggregates telemetry and transaction outcomes.
- **Scoring Kernel**: Applies weighting model to compute validator scores.
- **Challenge Manager**: Handles disputes and slashing triggers.
- **Reporting API**: Exposes metrics to Token Management and Governance layers.
