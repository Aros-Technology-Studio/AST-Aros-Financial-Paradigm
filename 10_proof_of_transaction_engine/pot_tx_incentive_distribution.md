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
1. Collect fees from NodeChain TX.
2. Canonical 75/25 split: 75% to node pool, 25% to AFC reserve.
3. Disburse node pool to individual validators by PoT-normalized weight.

## 4. Formula
```
nodePool    = totalFees × 0.75
afcReserve  = totalFees × 0.25
nodeReward  = nodePool × (node_weight / total_weights)
```

## 5. Python Example
```python
NODE_SHARE = 0.75
AFC_SHARE  = 0.25

def distribute(total_fees: float, nodes: list[dict]) -> dict:
    node_pool  = total_fees * NODE_SHARE
    afc_share  = total_fees * AFC_SHARE
    total_weight = sum(n['weight'] for n in nodes)
    dist = {'AFC_RESERVE': afc_share}
    for node in nodes:
        dist[node['id']] = node_pool * (node['weight'] / total_weight)
    return dist
```

## 6. Dependencies
- 01_coin_engine/payment_distribution.md (fee splits).
- 08_fee_distribution/epoch_allocation_model.md (emission tie-in).

## 7. Notes
- Epoch-End: Distribute at epoch close in NodeChain.
- Audit: Feed to All-Seeing Eye for transparency.
