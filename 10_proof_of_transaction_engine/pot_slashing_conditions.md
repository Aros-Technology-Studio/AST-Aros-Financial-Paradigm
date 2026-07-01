# PoT Reputation Penalty Conditions

**Module:** AST PoT Engine
**Status:** Canonical (Model 1)
**Date:** 2026-07-01

## 1. Purpose

Defines how misbehavior detected in PoT affects a node's reputation and, through it, its
future payment weight. This is a Model-1 replacement for the earlier stake-slashing draft:
node influence in AST comes from work and reputation, never from a held balance, so a
misbehaving node loses future earning weight — it never has funds confiscated.

## 2. Principles

- **Reputation-based:** every unit of attempted work updates `successes`/`total`; reputation
  is `successes / total * uptime` (see `src/nodes/nodes.service.ts`, mirroring
  `reference/ast-core/src/nodes.ts`).
- **No stake, no balance mutation:** a `NodeEntity` carries no `stake` or `stakedBalance`
  field, and no service ever debits a node's earned value to penalize it (invariant I9,
  prohibitions P1/P2 in `AST_RULES.yaml`).
- **Automatic and proportional:** misbehavior recorded via `recordExecution(id, success=false)`
  lowers `successes/total` immediately, which recomputes `weight = reputation * uptime` before
  the next epoch's payment distribution — the penalty is felt in the next payout, not by
  seizing anything already earned.

## 3. Conditions That Lower Reputation

- **Invalid attestation / failed PoT check** — recorded as `recordExecution(nodeId, false)`.
- **No response to challenge** — recorded as `recordExecution(nodeId, false)`.
- **Repeated failures across an epoch** — each failure independently lowers `successes/total`;
  a node with a low success rate converges toward `weight -> 0`, earning a shrinking share of
  the node pool without any balance being touched.

## 4. Formula

```
reputation = successes / total * uptime      (1 when total == 0 — a fresh node starts trusted)
weight     = reputation * uptime
```

Weight recomputed after every `recordExecution` call; the node's *share* of the next epoch's
75% node pool (`CommissionService.finalizeEpoch`) shrinks proportionally to its weight
(`payment_per_node = (weight * nodePool) / Σweights`). Value already paid out for prior
confirmed work is never reversed.

## 5. Reference Implementation

```typescript
// src/nodes/nodes.service.ts
node.total += 1;
if (success) node.successes += 1;
node.reputation = (node.successes / node.total) * node.uptime;
node.weight = node.reputation * node.uptime;
```

## 6. Dependencies

- `src/nodes/nodes.service.ts` — reputation/weight computation (`NodesService`).
- `src/commission/commission.service.ts` — weight-proportional post-factum payment
  (`CommissionService.finalizeEpoch`).
- `13_extra_supervisory_layer/anomaly_detection_patterns.md` — passive anomaly signals the
  All-Seeing Eye surfaces; the Eye only observes and logs, it never mutates a node's reputation
  or weight itself (P6).

## 7. Notes

- Recovery: reputation is recomputed from the full `successes/total` history, so consistent
  future work steadily raises it back up — there is no permanent penalty ledger to appeal.
