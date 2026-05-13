# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Active  
**Date:** 2026-05-13  

## 1. Purpose

Distributes fee incentives to validating nodes post-PoT confirmation in NodeChain, following the
canonical 75/25 commission split defined in `01_coin_engine/payment_distribution.md`.

## 2. Principles

- **Canonical Split First**: The top-level split of every commission is always 75% → Node Pool,
  25% → AFC Reserve. This layer distributes only the 75% node pool portion.
- **Merit-Based**: Each node's share of the pool is proportional to its PoT weight.
- **No Fee Burn**: Fees are not burned at distribution time. Burning applies to the emitted ARO
  tokens (handled by `EmissionService`) — not to commission income.

## 3. Two-Level Distribution Model

```
Commission (= TX Amount × rate)
  ├── 75% → NODE POOL              ← this module distributes this portion
  │     └── Each node receives: nodePool × (node_weight / Σ node_weights)
  └── 25% → AFC RESERVE            ← locked in SYSTEM_AFC_RESERVE
```

> **Historical note**: Earlier versions of this document specified a 60% / 30% / 10% (validators /
> attesters / burn) split applied directly to total fees. That model has been superseded by the
> canonical 75/25 protocol (PR #72). Within the node pool, all active nodes — whether validators or
> attesters — compete on PoT weight alone; there is no hard role-tier percentage.

## 4. Formula

```
nodePool      = commission × 0.75
afcReserve    = commission × 0.25

node_weight_i = potScore(node_i) / Σ potScore(all_nodes)   # normalised, sums to 1.0

payment_i     = nodePool × node_weight_i
```

`potScore` is a function of verified transaction count, validation latency, and slashing penalties.

## 5. Reference Implementation

```python
def distribute_node_pool(commission: float, nodes: list[dict]) -> dict:
    node_pool = commission * 0.75
    # afc_reserve = commission * 0.25  # handled by EmissionService / FeeDistributionService

    total_weight = sum(n['pot_score'] for n in nodes)
    payments = {}
    for node in nodes:
        payments[node['id']] = node_pool * (node['pot_score'] / total_weight)
    return payments
```

## 6. Dependencies

- `01_coin_engine/payment_distribution.md` — canonical 75/25 split definition
- `src/token/emission.service.ts` — per-TX emission lifecycle (MINT → FEE → BURN)
- `src/fee_distribution/fee_distribution.service.ts` — epoch-level 75/25 distribution

## 7. Notes

- **Epoch-End**: Accumulated node pool tokens are distributed at epoch close in NodeChain.
- **Audit**: Every distribution event is fed to The All-Seeing Eye for transparency.
- **Commission Rate**: Governance can adjust the rate within protocol bounds via `EmissionService.updateCommissionRate()`.
