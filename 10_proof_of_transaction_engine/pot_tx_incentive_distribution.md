# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to PoT weight across active nodes.
- Reserve-Backed: Portion flows to AFC reserve, growing the emission price index.

## 3. Distribution Logic
1. Collect fees from NodeChain TX.
2. Canonical 75/25 split: 75% → node pool (distributed by PoT weight), 25% → AFC reserve.
3. Disburse node pool share proportionally by PoT weight per active node.

## 4. Formula
Node Incentive = total_incentives * (node_weight / total_weights)

## 5. Python Example
```python
def distribute(total_incentives: float, nodes: list[dict]) -> dict:
    total_weight = sum(n['weight'] for n in nodes)
    dist = {}
    for node in nodes:
        share = total_incentives * (node['weight'] / total_weight)
        dist[node['id']] = share
    return dist
```

## 6. Dependencies
- 01_coin_engine/payment_distribution.md (fee splits).
- 08_emission_layer/epoch_allocation_model.md (emission tie-in).

## 7. Notes
- Epoch-End: Distribute at epoch close in NodeChain.
- Audit: Feed to All-Seeing Eye for transparency.
