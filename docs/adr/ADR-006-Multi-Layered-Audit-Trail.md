# ADR-006: Multi-Layered Immutable Audit Trail
**Status:** Accepted

## Context
A standard transaction ledger is insufficient for the audit and traceability demands of financial regulators. To provide institutional-grade transparency, the AST Platform must be able to prove *what* happened, *who* authorized it, and *what* the system's internal monitors observed at the time. A simple transaction journal cannot answer all these questions.

## Decision
We will implement a **Multi-Layered Audit Trail system**. This creates several distinct, immutable, and cross-referenced logs, each dedicated to a specific domain.

1.  **Layer 1: Transaction Trail (Module 07):** The `tx_journal_writer` writes all user-initiated state changes (e.g., balance transfers) into a standardized log, formatted as per `tx_audit_log_format.md`.
2.  **Layer 2: Token Trail (Module 03):** A specialized log, `token_audit_trail.md`, records *only* protocol-level token operations: **Mint, Burn, Lock, and Freeze**. This provides a simple, clean log for auditors verifying total supply.
3.  **Layer 3: Governance Trail (Module 06):** A log that records all governance actions: **Proposals, Votes, and Executions** (e.g., changing a system parameter), as defined in `governance_auditability.md`.
4.  **Layer 4: Supervisory "Meta" Trail (Modules 12/13):** The `audit_trace_emitter.md` and `meta_event_logging_protocol.md` create a log of *observations and actions* taken by the AI Supervisory Framework (ADR-002). This is an "audit of the auditors."

All logs are hash-anchored to the core Nodechain to ensure immutability.

## Consequences

**Positive:**
* **Complete Auditability:** Regulators can query the exact log they need (e.g., "Show me all token minting events" or "Show me all AI-flagged transactions").
* **Separation of Concerns:** Developers can work with clean, domain-specific logs instead of parsing a single monolithic ledger.
* **Verifiable Oversight:** The "Meta Trail" (Layer 4) is a revolutionary feature that proves the AI monitors were active and what they observed, building unprecedented trust.

**Negative / Trade-offs:**
* **Storage Overhead:** Maintaining multiple, indexed, and immutable logs for every action generates significant data and increases storage costs for nodes.
* **I/O Bottleneck:** Writing to multiple logs during transaction processing (e.g., a single token transfer might hit 3 different logs) can add latency.
* **Log Consistency:** Requires complex logic to ensure all related logs are written correctly and can be cross-referenced, especially during a rollback or failure (`tx_rollback_strategy.md`).
