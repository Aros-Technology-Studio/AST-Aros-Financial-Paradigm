# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-05-12  

## 1. Purpose
Distributes incentives (commission fees) to validating nodes post-PoT confirmation in NodeChain,
following the canonical 75/25 split established in `01_coin_engine/payment_distribution.md`.

## 2. Principles
- Merit-Based: Proportional to PoT weight/role in NodeChain.
- Net-Zero Supply: Emitted ARO are burned after each TX; commission is the net value transfer.

## 3. Canonical Distribution Logic

1. Collect commission from each TX: `commission = txAmount × commissionRate` (default 0.5%).
2. Allocate per canonical split:
   - **75% → Node Pool** (`SYSTEM_NODE_POOL_00000000000000000000`) — distributed to validators by PoT weight.
   - **25% → AFC Reserve** (`SYSTEM_AFC_RESERVE_000000000000000000`) — locked; drives emission price index.
3. Disburse node-pool share proportionally across active validators.

> **Historical note**: Earlier drafts showed a 60/30/10 multi-actor split. The canonical protocol
> (adopted in PR #72) consolidates all node-side allocation into the 75% node pool, distributed
> internally by PoT weight. The 10% burn in the old draft is superseded by the canonical
> full-emission burn (`emissionAmount` burned atomically after each TX).

## 4. Formula

```
commission          = txAmount × commissionRate
node_pool_total     = commission × 0.75
afc_reserve_amount  = commission × 0.25

payment_per_node    = node_pool_total × (node_weight / Σ node_weights)
node_weight         = potScore(node) / Σ potScore(all_active_nodes)
```

## 5. Reference Implementation (TypeScript)

```typescript
// canonical entry point — EmissionService.processTransactionEmission()
const result = emissionService.calculate(txAmount, commissionRate);
// result.nodeShare  = commission * 0.75  → SYSTEM_NODE_POOL
// result.afcReserveShare = commission * 0.25 → SYSTEM_AFC_RESERVE

function distributeNodePool(nodePoolTotal: number, nodes: { id: string; weight: number }[]) {
    const totalWeight = nodes.reduce((s, n) => s + n.weight, 0);
    return nodes.map(n => ({
        nodeId: n.id,
        payment: nodePoolTotal * (n.weight / totalWeight),
    }));
}
```

## 6. Dependencies
- `01_coin_engine/payment_distribution.md` — canonical 75/25 split and validator weight formula.
- `src/token/emission.service.ts` — authoritative runtime implementation.
- `src/fee_distribution/fee_distribution.service.ts` — epoch-level `distributeRewards()`.

## 7. Notes
- Epoch-End: Accumulated node pool fees are distributed at epoch close via `FeeDistributionService`.
- Per-TX: `EmissionService.processTransactionEmission()` records nodeShare atomically on the ledger.
- Audit: Every distribution event is fed to The All-Seeing Eye for transparency and anomaly detection.
