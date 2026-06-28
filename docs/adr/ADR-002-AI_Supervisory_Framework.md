# ADR-002: AI Supervisory Framework ("The All-Seeing Eye")
**Status:** Accepted

## Context
The AST Platform targets high-stakes users (Governments, Financial Institutions) who require provable integrity, real-time security, and a level of auditability that base-layer consensus rules cannot provide alone. Standard consensus (like in ADR-001) confirms *valid* transactions, but it does not proactively monitor for *malicious patterns*, *collusion*, or *sophisticated fraud*. To operate as a "Swiss Watch," the platform needs an autonomous oversight mechanism.

## Decision
We will implement a dedicated, multi-layered **AI Supervisory Framework** (known as Modules 12 & 13, or "The All-Seeing Eye").

This framework is a federation of autonomous AI agents that operate *alongside* the core Nodechain consensus. It does not validate blocks, but continuously **monitors, audits, and signals** network activity.

Key components of this decision include:

1.  **Federated Agent-Based Architecture:** The system is not a single AI monolith. It is a collection of specialized agents with distinct roles (as defined in `agent_roles_matrix.md`).
2.  **Specialized Agent Roles:** Key agents include:
    * `Anomaly_Detection_Engine`: Monitors transaction patterns for suspicious activity (e.g., wash trading, front-running).
    * `Validator_Behavior_Monitor`: Tracks validator uptime, performance, and voting patterns to detect potential collusion or non-compliance.
    * `Consensus_Dispute_Resolver`: An autonomous agent empowered to investigate and resolve shard-level consensus forks or disputes.
3.  **Signal & Escalation Path:**
    * Upon detecting a threat, agents dispatch a `Fraud_Signal` via the `fraud_signal_dispatcher.md` protocol.
    * Critical signals are escalated to the Governance Layer (Module 06) for automated or human-in-the-loop intervention (`ai_governance_escalation.md`).
4.  **Immutable Meta-Audit:** The AI agents themselves generate a secure, "meta-event" log of all their observations and actions (`audit_trace_emitter.md`). This provides regulators with an unprecedented *audit of the audit* itself.

## Consequences

**Positive:**
* **Proactive Security:** Enables the platform to detect and mitigate complex threats in real-time, *before* they can cause catastrophic failure.
* **Institutional Trust:** This "All-Seeing Eye" provides the "legal-and-correctness" guarantee that institutions demand. It proves the system is under constant, intelligent supervision.
* **Automated Dispute Resolution:** The `Consensus_Dispute_Resolver` adds a powerful layer of stability, reducing the need for chaotic manual intervention in the event of a network fork.
* **Ultimate Auditability:** The meta-event log makes the platform fully transparent and accountable to auditors.

**Negative / Trade-offs:**
* **Performance Overhead:** The AI agents require significant data ingestion and real-time processing, adding computational overhead to the network infrastructure.
* **Risk of False Positives:** The `Anomaly_Detection_Engine` may flag benign but unusual activity. This requires a robust `meta_learning_feedback_loop` and clear governance rules to prevent unfair penalization.
* **Complexity:** This framework is a highly complex component, increasing the development, testing, and maintenance burden.
