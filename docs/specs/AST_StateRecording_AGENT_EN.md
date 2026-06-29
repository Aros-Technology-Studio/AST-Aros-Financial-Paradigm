# AST Entity Spec — State Recording (State Recording Engine) (agent-readable)

_Agent-oriented spec. English + YAML. Model 1. Derived from `AST_сущность_Фиксация_состояния_RU.md`. Captures and guarantees completeness of events; storage/immutability belong to NodeChain._

## English spec

**Entity:** State Recording (State Recording Engine) — captures significant process events and submits them to NodeChain, guaranteeing completeness and building the audit trail.
**Module:** `nodechain_engine` (state-recording function).
**Purpose:** Enforce P3 — every significant action leaves a record; no significant step passes silently.

**Responsibilities:** capture significant events; verify the mandatory event set per step; submit to NodeChain unchanged; assemble the audit trail.

**Operations:** `capture(event)`; `checkCompleteness(step)->bool` (blocks advancement if incomplete); `submit(event)->NodeChain`.

**Formulas:** `requiredEvents(step) ⊆ capturedEvents(step)`; `coverage = |captured| / |required| = 1` for a valid process.

**Invariants:** completeness; causal order; no advancement without capture; pass-through unchanged; PoT relies on full record.

**Scope:** capture, completeness, ordering, audit trail. Validation, linking, immutable storage and reconstruction belong to NodeChain.

## Machine spec (YAML)

```yaml
entity: StateRecording
aka: StateRecordingEngine
module: nodechain_engine     # state-recording function
purpose: Capture significant events, guarantee completeness and causal order, build audit trail (P3).

mandatory_events_per_process_type:   # set defined per process type
  - initiation
  - task_assignment
  - stage_transition
  - pot_verdict
  - emission_burn
  - commission_distribution
  - final_status

operations:
  capture:
    input: { event: ProcessEvent }
    output: { captured: ProcessEvent }
  checkCompleteness:
    input: { step: ProcessStep }
    rule: "requiredEvents(step) subset capturedEvents(step)"
    output: { complete: bool }
    effect: "if not complete -> step not passed; process does not advance"
  submit:
    input: { event: ProcessEvent }
    target: NodeChain          # validation + immutable storage there
    guarantee: pass_through_unchanged

formulas:
  completeness: "requiredEvents(step) subset capturedEvents(step)"
  coverage:     "coverage = |capturedEvents| / |requiredEvents| == 1  # for valid process"

invariants:
  - id: I-SR-1  rule: "completeness: all mandatory step events captured else step not passed (P3)"
  - id: I-SR-2  rule: "causal order of capture"
  - id: I-SR-3  rule: "no advancement/completion without capture"
  - id: I-SR-4  rule: "event passed to NodeChain unchanged"
  - id: I-SR-5  rule: "PoT verdict only over fully recorded history"

prohibitions:
  - no_advance_without_capture
  - no_event_reorder

data:
  populates: [ExecutionSnapshot, Transaction]   # owned by NodeChain

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  observes: Processes
  submits_to: NodeChain
  supports: [PoT, Audit]
  executed_by: Nodes
```
