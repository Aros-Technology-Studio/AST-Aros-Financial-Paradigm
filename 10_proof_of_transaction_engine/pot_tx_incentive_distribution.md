# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain,
following the canonical 75/25 split defined in `01_coin_engine/payment_distribution.md`.

## 2. Canonical Split

| Recipient     | Share | Address                                 |
|---------------|-------|-----------------------------------------|
| Node Pool     | 75%   | `SYSTEM_NODE_POOL_00000000000000000000` |
| AFC Reserve   | 25%   | `SYSTEM_AFC_RESERVE_000000000000000000` |

The AFC reserve accumulation drives the emission price index upward:
`reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000`

> **Historical note**: Earlier drafts showed a 60% validators / 30% attesters / 10% burn split.
> This was superseded by the canonical 75/25 model (PR #72). Governance bounties and
> ecosystem grants are funded from the AFC reserve, not from per-TX commission splits.
> The burn of emitted ARO occurs at the emission lifecycle level (`EmissionService`), not
> at the incentive-distribution level.

## 3. Distribution Logic

1. Collect fees from NodeChain TX (or epoch-aggregate).
2. **Canonical split**: 75% → node pool, 25% → AFC reserve.
3. Within the 75% node pool, disburse to each validator proportional to its PoT weight.

## 4. Formula

```
node_pool    = total_fees × 0.75
afc_reserve  = total_fees × 0.25

node_weight  = potScore(node) / Σ potScore(all_active_nodes)   # normalized, sums to 1.0
node_payout  = node_pool × node_weight
```

## 5. Python Example

```python
def distribute(total_fees: float, nodes: list[dict]) -> dict:
    node_pool   = total_fees * 0.75
    afc_reserve = total_fees * 0.25

    total_weight = sum(n['pot_score'] for n in nodes)
    payouts = {'AFC_RESERVE': afc_reserve}
    for node in nodes:
        weight = node['pot_score'] / total_weight  # normalized
        payouts[node['id']] = node_pool * weight
    return payouts
```

## 6. Dependencies
- `01_coin_engine/payment_distribution.md` — canonical 75/25 ratios and validator weight model.
- `src/token/emission.service.ts` — per-TX emission lifecycle (mint → fee split → burn).
- `src/fee_distribution/fee_distribution.service.ts` — epoch-level 75/25 distribution.

## 7. Notes
- Epoch-End: `FeeDistributionService.distributeRewards()` applies the same 75/25 split per epoch.
- Audit: All distribution steps are recorded as `FEE_DISTRIBUTION` / `VALIDATOR_REWARD` ledger
  entries and fed to The All-Seeing Eye for transparency.
- PoT weight normalization is enforced so that `Σ node_weight = 1.0` across all active nodes.
