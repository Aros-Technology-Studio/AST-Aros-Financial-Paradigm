# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-06-04 (updated from draft 2025-08-24)

## 1. Purpose

Distributes incentives (commission fees) to validating nodes post-PoT confirmation in NodeChain, following the canonical 75/25 split.

## 2. Principles

- **Merit-Based:** Within the node pool, each node receives a share proportional to its PoT weight.
- **AFC Reserve Growth:** 25% of every commission accumulates in the AFC reserve, driving the emission price index upward.
- **No Burn from Commission:** Burned tokens come from the canonical emission cycle (emitted ARO burned after TX completion), not from the commission split.

> **Migration note (2025-08-24 → 2026-06-04):** Earlier draft described a 60/30/10 split (validators/attesters/burn). The canonical protocol adopted by PR #72 consolidates this into a **75% node pool / 25% AFC reserve** model. Sub-distribution within the node pool (validators vs. attesters) is determined by PoT-normalized weights — not by hard percentage splits — so that every node is rewarded proportionally to contribution.

## 3. Distribution Logic

1. Collect fees from canonical TX cycle (see `EmissionService.processTransactionEmission()`).
2. Apply canonical split:
   - **75%** → `SYSTEM_NODE_POOL_00000000000000000000`
   - **25%** → `SYSTEM_AFC_RESERVE_000000000000000000`
3. Sub-distribute the node pool to individual validators by PoT weight.

## 4. Formula

```
nodePool    = totalFees × 0.75
afcReserve  = totalFees × 0.25

payment_per_node = nodePool × (node_pot_score / Σ pot_scores)
```

## 5. Python Example

```python
def distribute(total_fees: float, nodes: list[dict]) -> dict:
    node_pool = total_fees * 0.75
    afc_reserve = total_fees * 0.25

    total_weight = sum(n['pot_score'] for n in nodes)
    payments = {'AFC_RESERVE': afc_reserve}

    for node in nodes:
        share = node_pool * (node['pot_score'] / total_weight) if total_weight > 0 else 0
        payments[node['id']] = share

    return payments
```

## 6. Dependencies

- `01_coin_engine/payment_distribution.md` — canonical 75/25 rationale and address table.
- `src/token/emission.service.ts` — per-TX commission split implementation.
- `src/fee_distribution/fee_distribution.service.ts` — per-epoch distribution implementation.

## 7. Notes

- **Per-TX distribution:** triggered atomically inside `EmissionService.processTransactionEmission()`.
- **Epoch-End distribution:** triggered by `FeeDistributionService.distributeRewards()` at epoch close.
- **Audit:** All distributions are recorded on the ledger and fed to The All-Seeing Eye for transparency.
