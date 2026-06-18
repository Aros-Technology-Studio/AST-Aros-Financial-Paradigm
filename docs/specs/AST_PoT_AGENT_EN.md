# AST Entity Spec — Proof of Transaction (PoT) (agent-readable)

_Agent-oriented specification. English structured spec + machine spec (YAML). Model 1. Derived from `AST_сущность_PoT_RU.md`._

## English spec

**Entity:** Proof of Transaction (PoT) — institutional/process verification mechanism that issues a binary verdict on whether a process was executed per rules.
**Module:** `proof_of_transaction_engine`.
**Purpose:** Grant value the right to exist. Value is valid only where execution is proven (P1). PoT is the gate between "done" and "valued".

**Responsibilities:**
- Verify the composite execution criteria of a process.
- Issue a deterministic verdict `verified ∈ {0,1}` bound to that process.
- Emit authorizing signals: enable emission, enable node payment, admit the operation into PoT_volume.
- Record the verdict as a state in NodeChain.

**Verification criteria (all required for verified=1):** admissible context; full stage sequence; states recorded in NodeChain; completion per rules.

**Operations (contracts):**
- `verify(process) -> {verified, criteriaResult}` — deterministic; bound to one process; idempotent per process (no double-confirm).
- `authorizeEmission(process) -> bool` — returns true iff `verified(process)==1`.

**Formulas:** `verified ∈ {0,1}`; `value(tx) valid ⟺ verified(tx)=1`; `mint(p) allowed ⟺ verified(p)=1`; `PoT_volume = Σ(tx.amount × tx.verified)`.

**Invariants:** value only on verified=1; deterministic verdict; closed (criteria not externally overridable); one verdict per process; verdict valid only when recorded in NodeChain.

**Comparison (clarifying, not definition):** PoW rewards compute, PoS rewards stake (possession of resource); PoT pays for executed, verified work (P2). Hence no mining, no staking, no consensus reward.

**Scope:** establishes the fact of execution and issues the verdict. Execution is done by Nodes; storage by NodeChain; issuance by Emission. PoT judges; others act on its verdict.

## Machine spec (YAML)

```yaml
entity: ProofOfTransaction
abbrev: PoT
module: proof_of_transaction_engine
purpose: Verify the fact of execution and authorize value, emission, payment, metrics.
nature: judicial, evidentiary; establishes a fact, not a majority opinion

verification_criteria:        # all required for verified=1
  - admissible_context
  - full_stage_sequence
  - states_recorded_in_nodechain
  - completion_per_rules

operations:
  verify:
    input: { process: Process }
    rule: "ALL(verification_criteria) == true"
    output: { verified: bool, criteriaResult: map, linkedSnapshot: ref(ExecutionSnapshot) }
    properties: [deterministic, idempotent_per_process]
  authorizeEmission:
    input: { process: Process }
    output: { allowed: bool }   # allowed == verified(process)
  authorizePayment:
    input: { process: Process }
    output: { allowed: bool }

data_model:
  PoTVerdict:
    processId: ref(Process)
    verified: bool
    validatorRef: ref(Node)
    criteriaResult: map
    linkedSnapshot: ref(ExecutionSnapshot)
    timestamp: timestamp

formulas:
  verifiedFlag:      "verified in {0,1}"
  valueValidity:     "value(tx) valid <=> verified(tx) == 1"
  emissionCondition: "mint(process) allowed <=> verified(process) == 1"
  potVolume:         "PoT_volume = sum(tx.amount * tx.verified)"

invariants:
  - id: I-PoT-1  rule: "value valid only when verified == 1 (P1)"
  - id: I-PoT-2  rule: "deterministic verdict: same data -> same verdict (P4)"
  - id: I-PoT-3  rule: "closed: verification criteria not externally overridable"
  - id: I-PoT-4  rule: "one verdict per process; no re-confirmation (anti double-emission)"
  - id: I-PoT-5  rule: "verdict valid only when recorded in NodeChain (P3)"

prohibitions:           # negative tests
  - no_external_override_of_criteria
  - no_emission_without_verified
  - no_work_execution        # PoT judges, does not execute
  - no_storage               # storage belongs to NodeChain

comparison:               # clarifying note, not a definition
  pow: rewards compute power (possession)
  pos: rewards locked stake (possession)
  pot: pays for executed and verified work (P2)
  consequence: [no_mining, no_staking, no_consensus_reward]

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  signals_to:  [Emission, Commission, Metrics]
  records_to:  [NodeChain]
  validated_by: [Nodes]
```
