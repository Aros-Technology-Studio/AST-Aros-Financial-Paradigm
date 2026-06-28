# AST Entity Spec — Commission (Commission Engine) (agent-readable)

_Agent-oriented spec. English + YAML. Model 1. Derived from `AST_сущность_Комиссия_RU.md`. Commission computes and distributes payment for executed work; mint/burn is in the Emission spec._

## English spec

**Entity:** Commission (Commission Engine) — computes the operation fee, consolidates it into the operational pool, and distributes payment to nodes post-factum by participation weight.
**Module:** `settlement_controller` (fee-distribution).
**Purpose:** Realize "payment for executed work" (P2) as the value flow: turn confirmed execution into proportional node payment.

**Responsibilities:** compute `fee`; accrue into per-epoch pool; on epoch finalization compute node weights (PoT-confirmed work) and distribute; allocate operational margin to AST.

**Operations:** `computeFee(tx)->fee`; `accrue(fee)->pool`; `finalizeEpoch()->distribution` (pre: only PoT-confirmed participation counts).

**Formulas:** `fee = tx.amount × feeRate`; `paymentToNode = (node_weight × tx.fee) / Σ(weights)`; `dynamicFee = fee × (1 + overloadRate)`; `Σ(paymentToNode) + operationalMargin = Σ(fee)` per epoch.

**Invariants:** post-factum; only confirmed work; proportional to weight; pool reconciles to zero remainder; no payment for presence.

**Scope:** computes and distributes payment for executed work. Verdict by PoT; issuance by Emission; storage by NodeChain.

## Machine spec (YAML)

```yaml
entity: Commission
aka: CommissionEngine
module: settlement_controller
purpose: Compute fee, pool it, distribute post-factum node payment by weight (P2).

data_model:
  EpochEntity:
    epochNumber: int
    startTime: timestamp
    endTime: timestamp
    totalFees: decimal
    distributionLog: list   # who, for what, how much (recorded in NodeChain)
    status: enum[open, finalized, archived]

operations:
  computeFee:
    input: { tx: Transaction }
    output: { fee: decimal }
    formula: "fee = tx.amount * feeRate"
  accrue:
    input: { fee: decimal }
    effect: "pool[epoch] += fee"
  finalizeEpoch:
    input: { epoch: EpochEntity }
    steps: [compute node weights from PoT-confirmed work, distribute, allocate margin, record distributionLog in NodeChain]
    output: { distribution: list, operationalMargin: decimal }
    precondition: "only participation with PoT verified == 1 is counted"

formulas:
  fee:           "fee = tx.amount * feeRate"
  paymentToNode: "paymentToNode = (node_weight * tx.fee) / sum(weights)"
  dynamicFee:    "dynamicFee = fee * (1 + overloadRate)"
  poolReconcile: "sum(paymentToNode) + operationalMargin = sum(fee)  # per epoch"

invariants:
  - id: I-CM-1  rule: "payment only post-factum (P2)"
  - id: I-CM-2  rule: "only PoT-confirmed participation counts (verified == 1)"
  - id: I-CM-3  rule: "share proportional to node weight"
  - id: I-CM-4  rule: "pool reconciles: sum(payments) + margin == sum(fees) per epoch"
  - id: I-CM-5  rule: "no payment for presence/readiness"

prohibitions:
  - no_payment_for_presence
  - no_payment_without_pot

zones:
  - commission_part_form   # minted in ArosCoin OR charged in value; see Emission

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  gated_by: PoT
  pays: Nodes
  form_decided_with: Emission
  records_to: NodeChain
  margin_to: Reserve
```
