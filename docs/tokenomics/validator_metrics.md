# Validator Performance & Reputation Metrics

## 1. Transactional Validator Score (TVS)
The `TVS` is an index of node performance aimed at assessing how quickly and correctly a node processes transactions.

$$
TVS_i = \left( \sum_{j=1}^{V} (1 + \Delta t_j S_j) \right) \times U
$$

Where:
*   **$V$**: Number of valid transactions processed.
*   **$\Delta t_j$**: Validation latency factor (normalized).
*   **$S_j$**: Signature correctness (1 if valid, 0 if invalid).
*   **$U$**: Uptime coefficient (0.0 to 1.0).

**Purpose**: Used for calculating short-term performance payments.

## 2. Node Reputation Index (NRI)
The `NRI` is an aggregated rating of a node, considering its historical performance.

$$
NRI = \frac{1}{n} \sum_{k=1}^{n} TVS_k \cdot w_k
$$

Where:
*   **$n$**: Number of historical periods considered.
*   **$TVS_k$**: TVS score for period $k$.
*   **$w_k$**: Decay weight for period $k$ (older periods have lower weight).

**Purpose**: Used for selecting validators for consensus and distributing emission payments.

## 3. Token Distribution (Payments)
Payments are distributed proportional to reputation.

$$
T_i = \sum_{j \in eligible} \frac{NRI_i}{NRI_j} E
$$

Where:
*   **$T_i$**: Tokens allocated to node $i$.
*   **$E$**: Total new emission to be distributed.
*   **$NRI_i / \sum NRI$**: Share of the pool logic.
