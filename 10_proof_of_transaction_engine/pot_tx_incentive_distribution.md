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

1. Collect commission from each finalized PoT TX.
2. Allocate:
   - **75%** → Node Pool (`SYSTEM_NODE_POOL_00000000000000000000`)
   - **25%** → AFC Reserve (`SYSTEM_AFC_RESERVE_000000000000000000`)
3. Within the node pool, disburse per PoT-normalized weight (see §4).

> **Historical note**: Earlier revisions of this file specified a 60/30/10 split across validators, attesters, and burn. The canonical protocol (PR #72) supersedes this with the unified 75/25 model. Governance bounties and ecosystem grants are funded from the AFC reserve via governance vote, not from the per-TX commission split.

## 4. Formula

```
node_pool    = total_incentives × 0.75
afc_reserve  = total_incentives × 0.25

payment_per_node = node_pool × node_weight
node_weight      = potScore(node) / Σ potScore(all_nodes)
```

## 5. Python Example

```python
NODE_SHARE = 0.75
AFC_SHARE  = 0.25

def distribute(total_incentives: float, nodes: list[dict]) -> dict:
    node_pool   = total_incentives * NODE_SHARE
    afc_reserve = total_incentives * AFC_SHARE

    total_weight = sum(n['weight'] for n in nodes)
    dist = {'afc_reserve': afc_reserve}
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
