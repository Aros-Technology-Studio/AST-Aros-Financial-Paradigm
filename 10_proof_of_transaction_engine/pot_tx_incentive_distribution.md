# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to PoT weight/role in NodeChain.
- Non-dilutive: Emitted ARO are burned after TX completes; net circulating supply change = 0.

## 3. Canonical Distribution Logic

Canonical split per the `EmissionService` (src/token/emission.service.ts):

1. Collect commission from NodeChain TX: `commission = tx_amount × rate` (default 0.5%)
2. Allocate: **75% node pool** (distributed by PoT weight), **25% AFC reserve** (locked).
3. Disburse node pool share proportionally by PoT weight.

> Prior spec (60% validators / 30% attesters / 10% burn) is superseded by the canonical
> 75/25 model. The burn no longer comes from the commission; ARO emission is burned
> separately after each TX cycle (`CANONICAL_BURN` step in EmissionService).

## 4. Formulas

```
Commission      = tx_amount × rate               (default rate = 0.005)
Node Pool       = Commission × 0.75
AFC Reserve     = Commission × 0.25
Node Incentive  = Node_Pool × (node_weight / total_weights)
```

## 5. Python Example
```python
def distribute(tx_amount: float, nodes: list[dict], rate: float = 0.005) -> dict:
    commission   = tx_amount * rate
    node_pool    = commission * 0.75
    afc_reserve  = commission * 0.25

    total_weight = sum(n['weight'] for n in nodes)
    dist = {'afc_reserve': afc_reserve}
    for node in nodes:
        dist[node['id']] = node_pool * (node['weight'] / total_weight)
    return dist
```

## 6. Dependencies
- 01_coin_engine/payment_distribution.md (fee splits).
- 08_emission_layer/epoch_allocation_model.md (emission tie-in).

## 7. Notes
- Epoch-End: Distribute at epoch close in NodeChain.
- Audit: Feed to All-Seeing Eye for transparency.
