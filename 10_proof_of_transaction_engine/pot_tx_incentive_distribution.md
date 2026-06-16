# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to PoT weight in NodeChain.
- Non-inflationary: Net circulating supply change per canonical TX cycle is zero (emit then burn).

## 3. Distribution Logic

Canonical 75/25 fee split (from `fee_distribution.service.ts`):

1. Collect fees from NodeChain TX.
2. Allocate: **75% → node pool** (distributed by PoT weight), **25% → AFC reserve**.
3. Within the node pool, disburse per normalized PoT weight (proportional to `batchesValidated` and `batchesProposed`, penalised for `missedVotes`).

> **Historical note:** An earlier draft proposed a 60% / 30% / 10% three-way split (validators / attesters / burn). That model was superseded by the canonical 75/25 model implemented in `EmissionService` and `FeeDistributionService`.

## 4. Formula

**Fee split (top level):**
```
nodePool   = totalFees × 0.75
afcReserve = totalFees × 0.25
```

**Per-node reward (within node pool):**
```
nodeReward = nodePool × (node_weight / total_weights)
```

## 5. Python Example
```python
NODE_SHARE_RATIO = 0.75
AFC_SHARE_RATIO  = 0.25

def distribute(total_fees: float, nodes: list[dict]) -> dict:
    node_pool   = total_fees * NODE_SHARE_RATIO
    afc_reserve = total_fees * AFC_SHARE_RATIO

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
