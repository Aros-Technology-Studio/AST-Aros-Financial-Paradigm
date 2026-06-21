# PoT — Node Accountability Conditions (Model 1)

**Module:** AST PoT Engine
**Status:** Current (Model 1)
**Date:** 2026-06-21

## 1. Purpose

Defines how the PoT Engine responds when a node fails to satisfy verification criteria
during a process lifecycle. Node accountability in AST is based on work quality and
reputation — not on token balance deduction or stake forfeiture (project P1/P2).

## 2. Principles

- **Work-based accountability**: A node's standing in the system reflects its execution
  history and reputation weight. A node that fails PoT verification criteria for a process
  receives no commission payment for that process (presence earns nothing; only confirmed
  work earns).
- **Reputation-weighted consequences**: Repeated failures reduce a node's reputation weight
  (the `executionScore` tracked by `NodesService`), lowering its share of future epoch
  distributions proportionally.
- **Admission-based exclusion**: A node whose reputation weight falls below system thresholds
  may be excluded from process assignment until it demonstrates recovery through successful
  execution.
- **No token balance deduction**: AST does not deduct from or burn a node's ArosCoin balance
  as a penalty. Node influence comes from work and reputation, not from token holdings.

## 3. Accountability Conditions

| Condition | PoT Consequence | Reputation Consequence |
|-----------|-----------------|------------------------|
| Verdict `verified === 0` (process failed all criteria) | No commission for any participating node for that process | `recordExecution(nodeId, false)` decrements execution score |
| Node absent from process (not assigned) | Not eligible for that process's epoch weight | No score change (node did not participate) |
| Repeated non-confirmation across epochs | Steadily declining `currentWeight` from low execution score | Reduces share of future epoch distributions |
| Severe / persistent failure | Assignment exclusion until weight recovers above threshold | Recovery requires successful confirmed executions |

## 4. Commission Accountability Formula

```
nodePayment = (nodeWeight × distributablePool) / Σ(allConfirmedWeights)

where distributablePool = epochFees × 0.75  (75% to nodes)
      nodeWeight         = confirmations in epoch with verified === 1 × currentWeight
```

A node that participated in a process with `verified === 0` contributes **zero** to
`confirmedWeights` for that epoch and receives no payment from it.

## 5. Implementation

- **PoT gate**: `PotService.verify()` issues a binary verdict (`verified: 0 | 1`). The
  verdict is recorded in NodeChain (I3) and is the sole gate for value creation.
- **Reputation tracking**: `NodesService.recordExecution(nodeId, success: boolean)` updates
  the node's execution history. `NodesService.currentWeight(nodeId)` derives the node's
  current weight from its execution score and uptime ratio.
- **Payment gate**: `CommissionService.confirmedWeights()` includes a node's participation
  only when the associated process has `verified === 1`.

## 6. What This Is Not

Node accountability in AST does not include any of the following, which belong to
earlier model variants and are not part of Model 1:

- Token balance deduction or stake forfeiture for misbehavior.
- Burning a percentage of a staked amount in response to a challenge failure.
- Token-weighted governance over penalty severity.
- Automatic smart-contract slashing triggered by on-chain events.

## 7. References

- Spec: `docs/specs/AST_PoT_AGENT_EN.md`, `docs/specs/AST_Commission_AGENT_EN.md`,
  `docs/specs/AST_Nodes_AGENT_EN.md`
- Rules: `AST_RULES.yaml` invariants I9, P1, P2
- Implementation: `src/pot/pot.service.ts`, `src/nodes/nodes.service.ts`,
  `src/commission/commission.service.ts`
