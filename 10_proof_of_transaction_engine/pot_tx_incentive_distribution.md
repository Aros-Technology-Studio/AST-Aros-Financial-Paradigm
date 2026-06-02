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

Canonical 75/25 split (aligned with `EmissionService` and `FeeDistributionService`):

1. Collect fees/commission from NodeChain TX.
2. Allocate: **75% → Node Pool** (distributed to validators by PoT weight), **25% → AFC Reserve**.
3. Within the Node Pool, each validator receives a share proportional to its normalized PoT weight.

> **Note**: Earlier revisions described a 60% / 30% / 10% multi-bucket split. That model was superseded by the canonical 75/25 protocol adopted in PR #72. Governance bounties and ecosystem grants are funded separately from AFC reserve, not from the per-TX commission split.

## 4. Formula

```
nodePool    = total_incentives × 0.75
afcReserve  = total_incentives × 0.25

node_weight      = potScore(node) / Σ potScore(all_nodes)
node_incentive   = nodePool × node_weight
```

## 5. Python Example
```python
NODE_SHARE = 0.75
AFC_SHARE  = 0.25

def distribute(total_incentives: float, nodes: list[dict]) -> dict:
    node_pool   = total_incentives * NODE_SHARE
    afc_reserve = total_incentives * AFC_SHARE

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
