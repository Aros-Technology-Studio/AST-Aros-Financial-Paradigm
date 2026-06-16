# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-06-16  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to PoT weight in NodeChain.
- AFC Reserve: Portion locked to grow the emission price index.

## 3. Canonical Distribution Logic

All collected fees (per-TX commission and epoch-level fees) are split identically:

| Recipient      | Share | Address                                   |
|----------------|-------|-------------------------------------------|
| **Node Pool**  | **75%** | `SYSTEM_NODE_POOL_00000000000000000000` |
| **AFC Reserve**| **25%** | `SYSTEM_AFC_RESERVE_000000000000000000`|

The node pool is then sub-distributed to individual validators by PoT-normalized weight.

> **Note**: Earlier drafts of this document stated a 60/30/10 split (validators/attesters/burn).
> That model was superseded by the canonical 75/25 protocol adopted in PR #72.
> The canonical implementation is `FeeDistributionService.distributeRewards()` and
> `EmissionService.processTransactionEmission()` in `src/`.

## 4. Formula

```
node_pool   = total_incentives × 0.75
afc_reserve = total_incentives × 0.25

reward_per_node = node_pool × (node_weight / Σ all_node_weights)
```

## 5. Python Example

```python
def distribute(total_incentives: float, nodes: list[dict]) -> dict:
    node_pool   = total_incentives * 0.75
    afc_reserve = total_incentives * 0.25

    total_weight = sum(n['weight'] for n in nodes)
    dist = {'AFC_RESERVE': afc_reserve}
    for node in nodes:
        share = node_pool * (node['weight'] / total_weight)
        dist[node['id']] = share
    return dist
```

## 6. Dependencies
- `01_coin_engine/payment_distribution.md` — canonical 75/25 split spec.
- `src/fee_distribution/fee_distribution.service.ts` — reference implementation.
- `src/token/emission.service.ts` — per-TX emission lifecycle.

## 7. Notes
- Epoch-End: Distribute at epoch close via `FeeDistributionService.triggerEpochCycle()`.
- Audit: Every distribution recorded on ledger and fed to All-Seeing Eye.
