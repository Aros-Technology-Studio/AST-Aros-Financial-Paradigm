node_participation_payments.md

I. Purpose

This document defines the logic for incentivizing node operators in AST’s decentralized transaction processing network. Payments are issued in ARO tokens as compensation for contribution to transaction encryption and system resilience.

⸻

II. Scope

The payment model applies to all verified nodes participating in the decentralized encryption and validation of transactional data in the AST NodeChain. This mechanism supports fairness, redundancy, and uptime guarantees.

⸻

III. Payment Structure
1.Transaction-Based Payments
•Each validated transaction yields a payment fee distributed across contributing nodes.
•Distribution is proportional to participation weight (based on resource contribution, latency, and uptime).
2.Performance Indexing
•Nodes are scored using a Node Performance Index (NPI):

NPI = (uptime_score × availability_weight + latency_score × latency_weight + reputation_score) ÷ 3


3.Participation Weights
•Weighting mechanism balances short-term performance and long-term trust.
•Nodes must maintain a minimum NPI score to remain eligible.

⸻

IV. Payment Calculation

flowchart TD
    A[New Transaction Processed] --> B[Identify Contributing Nodes]
    B --> C[Measure NPI for Each Node]
    C --> D[Calculate Share Based on NPI Weights]
    D --> E[Distribute ARO Tokens]
    E --> F[Log Distribution in Payment Ledger]


⸻

V. Penalty and Revocation Rules

ConditionPenalty
Uptime < 80% (rolling 30 days)Temporary suspension (7 days)
Repeated drop in NPIReduction of payment share
Proven malicious behaviorImmediate ban + loss of pending payments


⸻

VI. Payout Cycle
•Payments are calculated per transaction, but batched and paid out every 12 hours.
•Transactions and corresponding payment splits are logged in the Immutable Payment Ledger.

⸻

VII. Transparency and Auditing
•Public dashboard provides:
•Node leaderboard (NPI & payments)
•Audit trail per payout
•Penalty history (if applicable)

⸻
