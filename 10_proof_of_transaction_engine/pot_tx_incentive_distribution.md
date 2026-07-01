# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-06-18  

## 1. Purpose

Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain,
following the canonical 75/25 split defined in `01_coin_engine/payment_distribution.md`.

## 2. Principles

- **Merit-Based:** Each node's share is proportional to its PoT weight within the node pool.
- **Canonical Split:** 75% of every commission goes to the node pool; 25% goes to the AFC reserve.
- **No Direct Burn:** ARO are burned post-emission via `EmissionService`; the incentive pool itself is not burned.

## 3. Distribution Logic

1. `EmissionService` (or `FeeDistributionService` at epoch close) computes the 75/25 split.
2. **75%** of total commission → `SYSTEM_NODE_POOL_00000000000000000000` (node pool).
3. **25%** of total commission → `SYSTEM_AFC_RESERVE_000000000000000000` (reserve).
4. Node pool is sub-distributed to individual validators by normalized PoT weight.

> **Historical note:** Earlier drafts of this file used a 60%/30%/10% split (validators/attesters/burn).
> The canonical protocol consolidates all node actors into a single 75% node pool with internal
> PoT-weight sub-distribution. The process part is burned separately by `EmissionService.burn()`
> after commission accrual — burning is not a slice of the commission split.

## 4. Canonical Formulas

```
commission        = transactionAmount × rate          (default rate = 0.5%)
nodePool          = commission × 0.75                 (75% → all participating nodes)
afcReserve        = commission × 0.25                 (25% → AFC reserve)

payment_per_node  = (weight × nodePool) / Σ weights
weight            = reputation × uptime
reputation        = successes / total × uptime         (work-based, no stake or balance)
```

Weight is computed per node by `NodesService` and summed across nodes with PoT-confirmed
participation in the epoch; `Σ weights` is the normalizing denominator (not fixed at 1.0).

## 5. TypeScript Reference

The canonical implementation lives in `src/emission/emission.service.ts` and
`src/commission/commission.service.ts`:

```typescript
// src/emission/emission.service.ts — EmissionService.calculate()
const commission = txAmount * commissionRate;
const nodeShare = commission * 0.75;  // → distributed by CommissionService.finalizeEpoch
const afcShare  = commission * 0.25;  // → routed to ReserveService.addAfcAccrual
```

Epoch-level distribution runs in `CommissionService.finalizeEpoch(epoch)`, which pays each
confirmed-weight node its share of the 75% pool and routes the 25% remainder to
`ReserveService`.

## 6. Example: $10,000 Transaction

```
commission  = 10,000 × 0.005 = 50 ARO
nodePool    = 50 × 0.75      = 37.50 ARO  (split by PoT weight across active nodes)
afcReserve  = 50 × 0.25      = 12.50 ARO  (routed to the AFC reserve accrual)
```

## 7. Dependencies

- `01_coin_engine/payment_distribution.md` — canonical 75/25 split specification.
- `src/emission/emission.service.ts` — per-TX emission (`EmissionService`).
- `src/commission/commission.service.ts` — epoch-level distribution (`CommissionService`).
- `src/nodes/nodes.service.ts` — reputation/weight computation (`NodesService`).

## 8. Notes

- **Epoch-End:** Distribution runs at epoch finalization via `CommissionService.finalizeEpoch()`,
  which records the outcome as a `commission.epoch.finalized` NodeChain event.
- **Audit:** Every distribution is appended to NodeChain; the All-Seeing Eye observes and logs
  it but never alters the distribution itself (P6).
