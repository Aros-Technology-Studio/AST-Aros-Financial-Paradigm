# AST Entity Spec — Nodes (agent-readable)

_Agent-oriented spec. English + YAML. Model 1. Derived from `AST_сущность_Ноды_RU.md`. Executing & validating infrastructure; storage chain is in the NodeChain spec._

## English spec

**Entity:** Nodes — registered nodes that execute process infrastructure work (validation, routing, fixation) and participate in state validation; paid for confirmed work; retain earnings.
**Modules:** `node_reputation_service` (reputation/weight/penalties), `nodechain_engine` (registration, execution, snapshot validation).
**Purpose:** The workforce of AST — execution from which, on confirmation, value arises. Influence and income derive from executed work and reputation, not from a held balance.

**Responsibilities:** register; accept and execute assigned tasks; participate in snapshot validation; accrue reputation; receive post-factum payment; retain earnings (P6).

**Operations:** `register()`; `executeTask(task)`; `validateSnapshot(snapshot)`; `receivePayment()` (post-factum, by weight).

**Formulas:** `nodeReputation = Σ(success)/Σ(total) × uptimeFactor`; `epochWeight = baseWeight × decayFactor`; `paymentToNode = (node_weight × tx.fee)/Σ(weights)`; Penalty Curve.

**Invariants:** paid only for PoT-confirmed work; influence from work/reputation not balance; strict assigned function; no staking (penalties hit reputation/admission); earned is retained.

**Scope:** execute infra work and validate states for confirmed contribution. Verdict by PoT; payment by Commission; storage by NodeChain.

## Machine spec (YAML)

```yaml
entity: Nodes
modules: [node_reputation_service, nodechain_engine]
purpose: Execute process work & validate states; earn for confirmed work; retain earnings (P6).

data_model:
  NodeEntity:
    id: string
    type: string                 # role/type of node
    metrics: { uptime: float, successes: int, total: int }
    status: enum[active, penalized, disconnected]
    weight: float
    reputation: float

operations:
  register:
    target: NodeChain
    effect: "node admitted; bound to metrics & reputation"
  executeTask:
    input: { task: Task }
    output: { result, events: list(ProcessEvent) }
  validateSnapshot:
    input: { snapshot: ExecutionSnapshot }
    output: { valid: bool }
  receivePayment:
    timing: post_factum
    formula: "paymentToNode = (node_weight * tx.fee) / sum(weights)"
    effect: "earned retained by node (P6)"

formulas:
  nodeReputation: "sum(success)/sum(total) * uptimeFactor"
  epochWeight:    "baseWeight * decayFactor"     # stale nodes lose influence
  paymentToNode:  "(node_weight * tx.fee) / sum(weights)"
  penalty:        "Penalty Curve: exponential trust decay for non-participation"

invariants:
  - id: I-ND-1  rule: "paid only for PoT-confirmed work (P2)"
  - id: I-ND-2  rule: "influence from work & reputation, not balance (P6)"
  - id: I-ND-3  rule: "strict assigned function (role isolation)"
  - id: I-ND-4  rule: "no staking; penalties hit reputation/admission not a locked stake"
  - id: I-ND-5  rule: "earned is retained; no payment for presence"

prohibitions:
  - no_staking
  - no_payment_for_presence
  - no_function_outside_assigned

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  registers_validates_in: NodeChain
  work_confirmed_by: PoT
  paid_by: Commission
  retained_feeds: Reserve
  params_from: system_triggers
```
