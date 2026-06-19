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
> The canonical protocol adopted by PR #72 consolidates all node actors into a single 75% node pool
> with internal PoT-weight sub-distribution. The 10% burn is replaced by the post-emission BURN
> step in `EmissionService.processTransactionEmission()`.

## 4. Canonical Formulas

```
commission        = transactionAmount × rate          (default rate = 0.5%)
nodePool          = commission × 0.75                 (75% → all participating nodes)
afcReserve        = commission × 0.25                 (25% → AFC reserve)

payment_per_node  = nodePool × node_weight
node_weight       = potScore(node) / Σ potScore(all_nodes)
potScore          = f(txCount, validations, penaltyScore)
```

PoT weight is normalized so that `Σ node_weight = 1.0` across all active nodes.

## 5. TypeScript Reference

The canonical implementation lives in `src/commission/commission.service.ts`:

```typescript
// CommissionService.finalizeEpoch() — per-epoch split (canonical 75/25)
const distributable = total * (1 - this.marginRate); // 75% to nodes
// nodes paid proportionally to confirmed PoT weight; remainder routes to reserve:
const allocatedMargin = total - paid;               // 25% → AFC reserve
await this.reserve.addAfcAccrual(allocatedMargin);
```

Per-process fee is computed in `CommissionService.computeFee()` and accrued via
`CommissionService.accrue()`; distribution happens at epoch finalization.

## 6. Example: $10,000 Transaction

```
commission  = 10,000 × 0.005 = 50 ARO
nodePool    = 50 × 0.75      = 37.50 ARO  (split by PoT weight across active nodes)
afcReserve  = 50 × 0.25      = 12.50 ARO  (recorded in NodeChain via reserve.afc.accrual)
```

## 7. Dependencies

- `docs/specs/AST_Commission_AGENT_EN.md` — canonical 75/25 split specification (Model-1 authority).
- `src/commission/commission.service.ts` — per-epoch implementation (`CommissionService`).
- `src/reserve/reserve.service.ts` — AFC accrual recording (`ReserveService.addAfcAccrual`).

## 8. Notes

- **Epoch-End:** Distribution runs at epoch close via `CommissionService.finalizeEpoch()`.
- **Audit:** Every split is recorded as a NodeChain event (`commission.epoch.finalized`); observed by All-Seeing Eye.
