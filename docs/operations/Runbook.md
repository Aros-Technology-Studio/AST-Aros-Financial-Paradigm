# AST Platform: Operator's Runbook

This document provides Standard Operating Procedures (SOPs) for node operators and the core team responsible for maintaining the health of the AST platform.

## 1. Monitoring

Operators must monitor the following key metrics:

* **Node Health:** `node.uptime`, `node.reputationScore` (from `/api/node/status`).
* **Network Health:** `network.consensusHealth`, `network.tps_5min_avg` (from `/api/network/status`).
* **AI Activity:** `ai.fraudSignals.critical` (from `/api/ai/signals/subscribe`).
* **Queue Depth:** `queue.tx_pending.size` (from Module 07 metrics).

## 2. Emergency Procedures (ADR-005)

This section covers responses to CRITICAL-level alerts.

### SOP: High-Risk Transaction / Attack Detected

1. **Alert:** A `CRITICAL` alert is received from the `AI Fraud Signal` WebSocket (Module 12).
2. **Action:** The Governance multi-sig members are notified.
3. **Triage:** Confirm if the alert is a true positive.
4. **Execute:** If confirmed, Governance executes the `pauseSystem()` function as defined in `emergency_governance_procedures.md`. This halts the `Bridge Layer (Module 05)` and `Processing Layer (Module 07)`.
5. **Post-Mortem:** Investigate the attack, deploy a fix, and resume the system via a governance vote.

### SOP: Consensus Failure / Shard Fork

1. **Alert:** `network.consensusHealth` changes to `Degraded` or `Halted`.
2. **Alert:** The `AI Consensus Dispute Resolver` (Module 12) emits a `VALIDATOR_COLLUSION` or `SHARD_FORK` signal.
3. **Action:** This triggers an **automatic** `ai_governance_escalation` (ADR-005), which may automatically pause the affected shard.
4. **Triage:** Core team investigates the logs of the misbehaving nodes.
5. **Execute:** Governance votes to slash the malicious nodes (`slashing_and_penalty_rules.md`) and restart the shard from the last known-good state.

## 3. Standard Maintenance

### SOP: Coordinated Node Upgrade

1. **Announce:** A new node software `VERSION` is announced.
2. **Schedule:** A "flag epoch" is set for the upgrade (e.g., epoch #1200).
3. **Action:** All node operators must upgrade their software *before* the flag epoch.
4. **Execute:** At epoch #1200, new consensus rules (if any) are automatically enabled. Nodes that failed to upgrade will be rejected by the network.

### SOP: Deploying a Local Node (for Testing)

* See `docs/development_guide.md` or the root `deployment_guide.md`.
* **Action:**
    1. `git clone ...`
    2. `cp .env.example .env` (and fill in values)
    3. `docker-compose up -d`
