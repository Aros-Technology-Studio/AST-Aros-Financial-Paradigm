# Payment Distribution Model for AST Node Infrastructure

## Purpose

This document outlines how fees (generated from transaction commission) are distributed among actors participating in the decentralized infrastructure of AST under the canonical 75/25 split.

---

## 1. Payment Sources

| Source               | Description                                                  |
|----------------------|--------------------------------------------------------------|
| `commission`         | Transaction Amount × commission rate (default 0.5%)         |
| `epoch_fees`         | Aggregate of `tx.fee` fields across all epoch transactions   |
| `penalty_reallocation` | Tokens confiscated from slashed nodes via governance vote  |

---

## 2. Canonical Distribution Split

| Recipient             | % of Commission/Fees | Address                                   |
|-----------------------|---------------------|-------------------------------------------|
| **Node Pool**         | **75%**             | `SYSTEM_NODE_POOL_00000000000000000000`   |
| **AFC Reserve**       | **25%**             | `SYSTEM_AFC_RESERVE_000000000000000000`   |

The node pool is then sub-distributed to individual validators by PoT-normalized weight (see §3).

> **Historical note**: Earlier documentation showed a 60/15/15/5/5 multi-actor split. The canonical protocol adopted by PR #72 consolidates this into the 75/25 model. Governance bounties and ecosystem grants are funded separately from the AFC reserve, not from the per-TX commission split.

---

## 3. Validator-Level Distribution (Node Pool)

Each active validator node receives a share of the **75% node pool** proportional to its PoT weight:

```
payment_per_node = nodePool × node_weight

node_weight = potScore(node) / Σ potScore(all_nodes)

potScore = f(txCount, validations, penaltyScore)
```

PoT weight is normalized so that `Σ node_weight = 1.0` across all active nodes.

---

## 4. AFC Reserve Logic

- Funds accumulate in `SYSTEM_AFC_RESERVE_000000000000000000`.
- Drive the emission price index: `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000`.
- Used for:
  - Ecosystem grants (via governance vote),
  - Emergency compensation (slashing fallback),
  - Node bootstrap funding.

---

## 5. Epoch-Level vs. Per-Transaction Distribution

| Trigger              | Split Applied | Implementation                          |
|----------------------|---------------|-----------------------------------------|
| Per canonical TX     | 75/25         | `EmissionService.processTransactionEmission()` |
| Per epoch finalization | 75/25       | `FeeDistributionService.distributeRewards()`   |

Both layers apply the same canonical ratios.

---

## 6. Anti-Abuse Checks

| Threat                      | Defense Mechanism                          |
|-----------------------------|--------------------------------------------|
| Payment spamming            | Minimum work unit requirement              |
| Validator cartelization     | Max cap per validator (adjustable via gov) |
| Fake observation nodes      | Continuous heartbeat + rotation mechanism  |
| Self-funded governance loop | Hard quorum threshold + 3rd-party audit    |

---

## 7. Governance Hooks

- **The All-Seeing Eye** tracks distribution anomalies.
- Commission rate adjustable via periodic governance votes (GVM), within protocol-defined bounds.
- Emergency override allows payment freezing in attack cases.

---

## 8. Summary

The canonical 75/25 split ensures that node operators are fairly compensated (75%) while the AFC reserve steadily accumulates value (25%), backing the rising emission price index and long-term ecosystem sustainability.

⸻
