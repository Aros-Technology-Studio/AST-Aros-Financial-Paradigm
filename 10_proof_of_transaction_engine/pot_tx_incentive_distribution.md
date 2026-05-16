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
1. Collect commission from each NodeChain TX (`commission = txAmount × rate`, default 0.5%).
2. Allocate: **75%** → node pool (validators & attesters, by PoT weight); **25%** → AFC reserve.
3. Sub-distribute the 75% node pool among individual validators proportional to their PoT weight score.

> **Note**: The previous 60/30/10 split is superseded by the canonical 75/25 model (PR #72). The 75% pool covers both validators and attesters via PoT-weight normalization; the 10% burn is replaced by the post-TX ARO burn in the canonical emission lifecycle.

## 4. Formula

```
commission       = txAmount × rate               (default rate = 0.5%)
node_pool        = commission × 0.75             (75% to nodes)
afc_reserve      = commission × 0.25             (25% to AFC reserve)

payment_per_node = node_pool × (node_weight / Σ node_weights)
```

## 5. Python Example
```python
def distribute(tx_amount: float, rate: float, nodes: list[dict]) -> dict:
    commission  = tx_amount * rate
    node_pool   = commission * 0.75
    afc_reserve = commission * 0.25   # sent to SYSTEM_AFC_RESERVE

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
