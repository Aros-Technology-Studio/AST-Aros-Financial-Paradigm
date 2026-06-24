# PoT Node Penalty Conditions

**Module:** AST PoT Engine
**Status:** Draft (Model-1 aligned)
**Date:** 2025-08-24

## 1. Purpose

Defines the conditions under which a node's reputation and status are adjusted
downward in response to misbehavior detected during PoT verification. Node influence
in Model-1 derives from work and reputation (I9 / I-ND-2); there is no stake to
forfeit. Penalties reduce a node's future participation weight.

## 2. Principles

- **Reputation-based:** Penalties reduce reputation (successes/total × uptime), which
  directly lowers a node's weight and its share of post-factum commission payments.
- **Status transition:** Severe or repeated misbehavior moves a node from `active` to
  `penalized`; a disconnected node moves to `disconnected`.
- **Proportional:** The severity of the status change matches the severity of the
  detected misbehavior.
- **Automatic:** Triggered by PoT anomalies and All-Seeing Eye signals; the Eye
  observes and signals but does not enforce (I10 / I-EYE-3).

## 3. Penalty Conditions

| Condition                          | Effect                                      |
|------------------------------------|---------------------------------------------|
| Invalid attestation (single)       | Failed work recorded; reputation decreases  |
| No response to challenge           | Work recorded as failure; reputation drops  |
| Repeated failures (> 3 per epoch)  | Status set to `penalized`; weight = 0       |
| Sustained non-participation        | Status set to `disconnected`                |

## 4. Reputation and Weight Formula

```
reputation = (successes / total) * uptime          # work quality × availability
weight     = reputation * uptime                   # participation weight (I9)
```

A penalized or disconnected node receives a weight of 0 in the current epoch,
so it earns no commission distribution for that epoch. The node can recover by
demonstrating correct participation in subsequent epochs.

## 5. Recovery

A node whose status is `penalized` transitions back to `active` when it
successfully completes a configurable number of consecutive verified tasks
in a subsequent epoch. Recovery is recorded in NodeChain as an append-only
event, preserving the full history (I8 / I-NC-1).

## 6. Dependencies

- `reference/ast-core/src/nodes.ts` — `recordWork(nodeId, success)` is the
  canonical implementation of reputation update on each PoT outcome.
- `src/nodes/nodes.service.ts` — NestJS production service.
- `13_extra_supervisory_layer/anomaly_detection_patterns.md` — signals that
  trigger penalty evaluation.
