# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-06-14  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to PoT weight across all active nodes.
- Deflationary: ARO are burned after each TX cycle; net circulating supply change = 0.

## 3. Distribution Logic (Canonical 75/25 — adopted PR #72)
1. Collect fees from NodeChain TX (commission = TX Amount × rate, default 0.5%).
2. Canonical split: **75% → Node Pool**, **25% → AFC Reserve** (`SYSTEM_AFC_RESERVE_000000000000000000`).
3. Node Pool disburse per PoT-normalized weight.

> **Note:** The earlier 60/30/10 (validators/attesters/burn) split is superseded.
> Governance bounties and ecosystem grants are funded from the AFC reserve, not from the per-TX split.

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
