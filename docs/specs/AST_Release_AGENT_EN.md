# AST Entity Spec — Release (Release Mechanism) (agent-readable)

_Agent-oriented spec. English + YAML. Model 1. Derived from `AST_сущность_Release_RU.md`. Maturity-gated transition to broader circulation._

## English spec

**Entity:** Release (Release Mechanism) — activates broader ArosCoin circulation when measurable maturity conditions are met.
**Module:** `release_daemon` (reads `velocity_tracker`).
**Purpose:** Controlled threshold between internal and extended circulation; prevents premature exposure of immature value (P7).

**Responsibilities:** monitor maturity metrics; check the dual condition; activate Release Phase; record activation.

**Conditions:** capitalization (`reserveIndex > threshold`) AND activity (`velocity > target`).

**Operations:** `monitor()`; `check()->bool`; `activate(ReleasePhase)` (records to NodeChain).

**Formulas:** `release_condition = (reserveIndex > threshold) AND (velocity > target)`; `velocity = processVolume_24h / circulatingSupply`.

**Invariants:** both conditions required; deterministic; circulation bounded before activation (P7); activation observable in NodeChain.

**Scope:** decide maturity onset and activate extended circulation. Capitalization is Reserve's job, activity is Velocity's, unit roles are ArosCoin's.

## Machine spec (YAML)

```yaml
entity: Release
aka: ReleaseMechanism
module: release_daemon
purpose: Activate broader ArosCoin circulation on maturity (P7 gate).

operations:
  monitor:
    reads: [reserveIndex, velocity]
  check:
    rule: "(reserveIndex > threshold) AND (velocity > target)"
    output: { mature: bool }
  activate:
    precondition: "check() == true"
    effect: ["ArosCoin extended role (5.3) enabled", "activation recorded in NodeChain"]
    else: "ArosCoin internal roles only (5.1-5.2)"

formulas:
  releaseCondition: "release_condition = (reserveIndex > threshold) AND (velocity > target)"
  velocity:         "velocity = processVolume_24h / circulatingSupply"
  thresholds:       "threshold, target set by system triggers (16.5)"

invariants:
  - id: I-RL-1  rule: "activation only when BOTH thresholds met"
  - id: I-RL-2  rule: "deterministic: same metrics -> same outcome (P4)"
  - id: I-RL-3  rule: "circulation bounded to internal roles before activation (P7)"
  - id: I-RL-4  rule: "activation recorded in NodeChain (observable)"

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  reads_from: [Reserve, Velocity]
  expands: ArosCoin
  thresholds_from: system_triggers
  records_to: NodeChain
```
