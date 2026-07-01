# Payment Distribution Model for AST Node Infrastructure

## Purpose

This document outlines how fees (generated from transaction commission) are distributed among actors participating in the decentralized infrastructure of AST under the canonical 75/25 split.

---

## 1. Payment Sources

| Source               | Description                                                  |
|----------------------|--------------------------------------------------------------|
| `commission`         | Transaction Amount × commission rate (default 0.5%)         |
| `epoch_fees`         | Aggregate of `tx.fee` fields across all epoch transactions   |

---

## 2. Canonical Distribution Split

| Recipient             | % of Commission/Fees | Address                                   |
|-----------------------|---------------------|-------------------------------------------|
| **Node Pool**         | **75%**             | `SYSTEM_NODE_POOL_00000000000000000000`   |
| **AFC Reserve**       | **25%**             | `SYSTEM_AFC_RESERVE_000000000000000000`   |

The node pool is then sub-distributed to individual nodes by PoT-normalized weight (see §3).

> **Historical note**: Earlier documentation showed a 60/15/15/5/5 multi-actor split. The canonical protocol adopted by PR #72 consolidates this into the 75/25 model. Governance bounties and ecosystem grants are funded separately from the AFC reserve, not from the per-TX commission split.

---

## 3. Node-Level Distribution (Node Pool)

Each active node receives a share of the **75% node pool** proportional to its PoT-confirmed
weight:

```
payment_per_node = (weight × nodePool) / Σ weights

weight     = reputation × uptime
reputation = successes / total × uptime   (work-based; no stake, no balance mutation)
```

The denominator `Σ weights` sums the weight of every node with PoT-confirmed participation in
the epoch (`CommissionService.finalizeEpoch`, `src/commission/commission.service.ts`).

---

## 4. AFC Reserve Logic

- Accrued via `ReserveService.addAfcAccrual()` (`src/reserve/reserve.service.ts`), recorded as
  `reserve.afc.accrual` NodeChain events for audit.
- Drives the emission price index: `reserveIndex = log10(1 + totalProcessVolume)`, derived from
  confirmed process volume in NodeChain history (spec I-RS-1/I-RS-2/I-RS-4).
- Used for:
  - Ecosystem grants (via governance vote),
  - Node bootstrap funding.

---

## 5. Epoch-Level vs. Per-Transaction Distribution

| Trigger              | Split Applied | Implementation                          |
|----------------------|---------------|-----------------------------------------|
| Per canonical TX     | 75/25         | `EmissionService.calculate()` / `mint()` / `burn()` |
| Per epoch finalization | 75/25       | `CommissionService.finalizeEpoch()`     |

Both layers apply the same canonical ratios.

---

## 6. Anti-Abuse Checks

| Threat                      | Defense Mechanism                          |
|-----------------------------|--------------------------------------------|
| Payment spamming            | Minimum work unit requirement              |
| Node cartelization          | Max cap per node (adjustable via gov)      |
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
