# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Active  
**Date:** 2026-06-15 (updated from 2025-08-24 draft to match canonical 1:1 emission model)

## 1. Purpose
Distributes incentives (fees/commission) to processing nodes post-PoT confirmation in NodeChain,
following the canonical 1:1 emission model defined in `01_coin_engine/coin_emission_model.md`.

## 2. Principles
- Merit-Based: Proportional to PoT weight per node.
- Transient Supply: ARO are burned after each TX cycle — net circulating change = 0.
- Reserve Growth: 25% of every commission locks into the AFC reserve, pushing the emission price index up.

## 3. Distribution Logic

```
Commission = Transaction Amount × rate   (default 0.5%)
Node Pool  = Commission × 0.75           (75% → processing nodes, split by PoT weight)
AFC Reserve= Commission × 0.25           (25% → SYSTEM_AFC_RESERVE, locked)
```

1. Collect commission from each finalized PoT transaction.
2. Route 75% to the node pool (`SYSTEM_NODE_POOL`).
3. Route 25% to the AFC reserve contract (`SYSTEM_AFC_RESERVE`).
4. Divide the node pool share among active validator nodes by normalized PoT weight.

> **Supersedes draft (2025-08-24):** The previous 60/30/10 split (validators / attesters / burn)
> is retired. The canonical split is **75% nodes / 25% AFC reserve** with no separate burn
> component from commission — the burn applies to the emitted ARO, not the commission.

## 4. Per-Node Incentive Formula

```
NodeIncentive_i = nodeProportion × nodeWeight_i / totalWeight
```

Where `nodeProportion = Commission × 0.75`.

## 5. Reference Implementation

```python
def distribute(commission: float, nodes: list[dict]) -> dict:
    """Canonical 75/25 PoT incentive distribution."""
    node_pool  = commission * 0.75
    afc_share  = commission * 0.25   # goes to SYSTEM_AFC_RESERVE

    total_weight = sum(n['weight'] for n in nodes)
    distribution = {'SYSTEM_AFC_RESERVE': afc_share}
    for node in nodes:
        distribution[node['id']] = node_pool * (node['weight'] / total_weight)
    return distribution
```

## 6. Dependencies
- `01_coin_engine/coin_emission_model.md` — canonical formula source of truth.
- `01_coin_engine/payment_distribution.md` — validator weight and fee split rules.
- `src/token/emission.service.ts` — authoritative code implementation.

## 7. Notes
- Epoch-End: Distribute at epoch close in NodeChain; same 75/25 split applies.
- Audit: All splits fed to All-Seeing Eye for transparency and replay.
- AFC Reserve Index: After accumulation, `reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000`.
