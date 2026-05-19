# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to weight/role in NodeChain.
- Deflationary: Portion burned.

## 3. Distribution Logic

Canonical split (aligned with `coin_emission_model.md` and `EmissionService`):

1. Collect fees from NodeChain TX.
2. Allocate: **75% → node pool** (distributed by PoT weight), **25% → AFC reserve**.
3. Disburse node pool per PoT-normalized weight.

## 4. Formula

```
Node Pool    = total_incentives × 0.75
AFC Reserve  = total_incentives × 0.25

Node Reward  = node_pool × (node_weight / total_weights)
```

## 5. Python Example
```python
AFC_RESERVE_RATIO = 0.25
NODE_POOL_RATIO   = 0.75

def distribute(total_incentives: float, nodes: list[dict]) -> dict:
    node_pool   = total_incentives * NODE_POOL_RATIO
    afc_reserve = total_incentives * AFC_RESERVE_RATIO

    total_weight = sum(n['weight'] for n in nodes)
    dist = {'AFC_RESERVE': afc_reserve}
    for node in nodes:
        share = node_pool * (node['weight'] / total_weight)
        dist[node['id']] = share
    return dist
```

## 6. Dependencies
- 01_coin_engine/payment_distribution.md (fee splits).
- 08_emission_layer/epoch_allocation_model.md (emission tie-in).

## 7. Notes
- Epoch-End: Distribute at epoch close in NodeChain.
- Audit: Feed to All-Seeing Eye for transparency.
