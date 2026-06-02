# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-06-02  

## 1. Purpose
Distributes incentives (commission fees) to validating nodes post-PoT confirmation in NodeChain.

## 2. Principles
- Merit-Based: Proportional to PoT weight per node.
- Canonical 75/25 split: 75% to node pool, 25% to AFC reserve.
- Net-zero supply: emitted ARO are burned after each TX cycle.

## 3. Distribution Logic

For every verified transaction of amount `A`:

1. Collect `commission = A × rate` (default rate = 0.5%).
2. Allocate: **75% → node pool**, **25% → AFC reserve**.
3. Disburse node pool share to each validator proportional to PoT weight.

> **Historical note**: Earlier drafts showed a 60/30/10 split. The canonical protocol
> adopted in PR #72 consolidates this into the 75/25 model aligned with
> `EmissionService` and `FeeDistributionService`.

## 4. Canonical Formula

```
commission    = transactionAmount × rate       (default 0.5%)
node_pool     = commission × 0.75              (→ SYSTEM_NODE_POOL)
afc_reserve   = commission × 0.25              (→ SYSTEM_AFC_RESERVE)

node_incentive = node_pool × (node_weight / Σ node_weights)
node_weight    = potScore(node) / Σ potScore(all_nodes)
```

## 5. Reference Implementation (TypeScript)

```typescript
// EmissionService.calculate() — src/token/emission.service.ts
const commission = transactionAmount * rate;      // 0.5% default
const nodeShare  = commission * 0.75;             // 75% → node pool
const afcShare   = commission * 0.25;             // 25% → AFC reserve

// Within node pool, per-node distribution:
const nodeIncentive = nodeShare * (node.potScore / totalPotScore);
```

## 6. Dependencies

- `src/token/emission.service.ts` — canonical emission lifecycle (source of truth).
- `01_coin_engine/payment_distribution.md` — canonical 75/25 split documentation.
- `08_fee_distribution/` — epoch-level fee distribution applying the same 75/25 ratios.

## 7. Notes
- Epoch-End: Distribute at epoch close in NodeChain using `FeeDistributionService.distributeRewards()`.
- Audit: Every distribution step is ledger-recorded and fed to The All-Seeing Eye.
