# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to PoT weight in NodeChain.
- Canonical 75/25 Split: 75% of fees → node pool; 25% → AFC reserve.
- Anti-Inflationary: AFC reserve accumulation drives the emission price index upward.

## 3. Distribution Logic

### Top-Level Canonical Split (per TX and per epoch)
1. Collect commission/fees from NodeChain TX.
2. Allocate: **75% → Node Pool**, **25% → AFC Reserve** (`SYSTEM_AFC_RESERVE_000000000000000000`).
3. Within the Node Pool (75%): disburse to individual validators by PoT-normalized weight.

> **Note (historical):** Earlier drafts described a 60%/30%/10% split (validators/attesters/burn).  
> The canonical protocol (adopted PR #72) consolidates the top-level split into 75/25 only.  
> Internal node-role sub-distribution (validators vs. attesters) is governed separately by PoT weight,  
> not by a fixed percentage of total fees.

## 4. Formula

### Top-Level
```
Node Pool    = total_fees × 0.75
AFC Reserve  = total_fees × 0.25

AFC Reserve Index = 1.0 + sqrt(totalAfcReserve) / 10_000
```

### Per-Node Distribution (within Node Pool)
```
node_incentive = node_pool × (node_pot_score / Σ pot_scores_all_nodes)
```

## 5. Python Example
```python
def distribute(total_fees: float, nodes: list[dict]) -> dict:
    node_pool    = total_fees * 0.75
    afc_reserve  = total_fees * 0.25

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
