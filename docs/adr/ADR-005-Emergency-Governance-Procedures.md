# ADR-005: AI-Assisted Emergency Governance Procedures
**Status:** Accepted

## Context
The AST Platform is engineered for high-stakes institutional use. While immutable, the system must be resilient against catastrophic events (e.g., critical smart contract exploits, consensus failures, severe economic attacks). In such scenarios, an uncontrolled, purely-decentralized system risks total value loss. Our target users (Banks, States) require a trusted "circuit breaker" or "stop-button" to halt damage.

## Decision
We will implement a hybrid **AI + Governance Emergency Halt Mechanism**. This provides a path for rapid, auditable intervention in a crisis.

1.  **AI Signal (Trigger):** The `AI Supervisory Framework` (ADR-002) acts as the first line of defense. When AI Agents detect a critical threat (e.g., `anomaly_detection_engine`), they dispatch a high-priority `Fraud_Signal`.
2.  **Governance Escalation (Action):** This signal triggers an `ai_governance_escalation`, which invokes the `emergency_governance_procedures`.
3.  **System Halt:** A special multi-signature "Governance Role" (defined in `governance_roles_and_permissions.md`) is empowered to execute a *temporary* system pause.
4.  **Scope of Halt:** This pause can include freezing token contracts (`token_lock_unlock_rules.md`), pausing the `Bridge Layer` (Module 05), or initiating emission rollbacks (`emission_rollbacks_and_freeze_rules.md`).

## Consequences

**Positive:**
* **Damage Control:** This mechanism allows the platform to be safely paused *during* an attack, preventing further losses while a fix is deployed.
* **Institutional Safety:** Provides a critical safety net that regulators and institutions demand. It proves the system is not "runaway."
* **Fast Response:** The AI-trigger mechanism is faster than relying on a slow, purely human vote to identify a threat.

**Negative / Trade-offs:**
* **Centralization Risk:** This is the most significant trade-off. The Governance entity with this "halt" power is a point of centralization and trust. This power could theoretically be abused.
* **Liveness over Safety:** This decision prioritizes **Safety** (protecting value) over **Liveness** (the system running 100% of the time).
* **Complexity:** The rules for *un-pausing* the system (`proposal_submission_protocol.md`) must be extremely robust to prevent deadlock.
