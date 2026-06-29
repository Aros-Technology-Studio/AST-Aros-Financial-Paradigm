# AST Entity Spec — NodeChain (agent-readable)

_Agent-oriented specification. English structured spec + machine spec (YAML). Model 1. Derived from the Russian ontology `AST_сущность_NodeChain_RU.md`._

## English spec

**Entity:** NodeChain — sovereign append-only execution-and-registration chain; the system of record of AST.
**Modules:** `nodechain_engine` (lifecycle + validation), `ledger` (append-only storage).
**Purpose:** Make every execution provable and irreversible by recording it as a cryptographically linked state. In AST, an action that is not recorded as state has no architectural validity (P3).

**Responsibilities:**
- Accept process-step events and persist them as `ExecutionSnapshot`s.
- Link each snapshot to the previous one (hash chaining) → tamper-evident history.
- Organize snapshot validation by registered validator nodes (deterministic, reputation-based).
- Serve immutable history for audit and for metric computation (PoT_volume, reserveIndex, velocity).

**Operations (contracts):**
- `recordState(event) -> snapshot` — pre: `event.admissible`; post: snapshot appended, `ledgerHeight += 1`, immutable.
- `validateSnapshot(snapshot) -> {valid}` — rule: well-formed AND `prevHash == head.hash` AND consistent with process rules; deterministic.
- `reconstruct() -> history` — recompute hashes from genesis; verify linkage; locate any divergence to a single snapshot.

**Formulas:** `ledgerHeight(n)=ledgerHeight(n-1)+1`; `hash(n)=H(payload(n) || prevHash(n) || sequenceId(n))`; `PoT_volume = Σ(tx.amount × tx.verified)`.

**Invariants:** append-only; hash continuity; completeness of recording; determinism; jurisdiction-bound keys/data.

**Scope:** records execution states only. Money movement, process initiation, asset conversion and end-user interaction belong to other entities/external executors (role isolation).

## Machine spec (YAML)

```yaml
entity: NodeChain
modules: [nodechain_engine, ledger]
purpose: Sovereign append-only execution-and-registration chain; system of record for AST.
nature: evidentiary, historical; gives actions their validity (P3)

data_model:
  ExecutionSnapshot:
    sequenceId: int          # monotonic position in chain
    hash: hash               # H(payload || prevHash || sequenceId)
    prevHash: hash           # link to previous snapshot
    validatorId: ref(Node)
    status: enum[created, confirmed, finalized]
    timestamp: timestamp
    payloadRef: ref          # description of what happened at this step
  Transaction:
    id: string
    hash: hash
    previousHash: hash
    sender: ref(role)        # role inside process, not end user
    recipient: ref(role)
    amount: decimal
    type: string
    verified: bool           # set by PoT
    ledgerHeight: int

operations:
  recordState:
    input: { event: ProcessEvent }
    precondition: "event.admissible == true"
    steps: [build ExecutionSnapshot, "prevHash = head.hash", validate, append]
    output: { snapshot: ExecutionSnapshot }
    postcondition: ["snapshot appended", "ledgerHeight += 1", "snapshot immutable"]
  validateSnapshot:
    input: { snapshot: ExecutionSnapshot }
    rule: "well_formed AND snapshot.prevHash == head.hash AND consistent_with_process_rules"
    output: { valid: bool }
    note: "deterministic; reputation/behavior-based; NOT hashpower or stake"
  reconstruct:
    input: {}
    output: { history: list(ExecutionSnapshot), integrity: bool }
    note: "recompute hashes from genesis; any tamper breaks linkage"

formulas:
  ledgerHeight: "ledgerHeight(n) = ledgerHeight(n-1) + 1"
  hashLink:     "hash(n) = H(payload(n) || prevHash(n) || sequenceId(n))"
  potVolume:    "PoT_volume = sum(tx.amount * tx.verified)"

invariants:
  - id: I-NC-1  rule: "append_only: no delete, no rewrite"
  - id: I-NC-2  rule: "hash_continuity: snapshot.prevHash == previous.hash"
  - id: I-NC-3  rule: "completeness: every significant event recorded else invalid (P3)"
  - id: I-NC-4  rule: "determinism: same input -> same validation result (P4)"
  - id: I-NC-5  rule: "jurisdiction_bound: keys and data bound to jurisdiction"

prohibitions:           # negative tests
  - no_money_custody
  - no_process_initiation     # records, never starts a process
  - no_asset_conversion
  - no_end_user_interaction

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  written_by: [PoT, Emission, Commission, process_stages]
  read_by:    [Metrics, Reserve, Audit]
  participants: [Nodes]
```
