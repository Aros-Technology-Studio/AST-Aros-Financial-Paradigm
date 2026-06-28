# AST Entity Spec — The All-Seeing Eye (agent-readable)

_Agent-oriented spec. English + YAML. Model 1. Derived from `AST_сущность_AllSeeingEye_RU.md` and canonical AST docs. Canonical model: passive meta-auditor — "witness, not judge". Main limit: no execution authority._

## English spec

**Entity:** The All-Seeing Eye — a passive supra-process read-only meta-observation layer (`extra_supervisory_layer`) overseeing architectural integrity across AST.
**Module:** `ast/extra_supervisory_layer` (+ `supervisory/anomaly_detection` as passive logging).
**Purpose:** Architectural traceability. Observe system metadata, detect structural anomalies/drift, log immutably, emit one-way integrity signals — without interfering with execution.
**Principle:** "witness, not judge". **Cycle:** observe → log → compare → signal.

**Overseer note:** like LacMusa (AFC) it is a supervisor that never initiates; UNLIKE LacMusa it has NO veto/halt — strictly passive (signals only). Any override/approval/pause role conflicts with the canonical model and would require a separate governance-authorized enforcement module.

**Observable scope (read-only metadata via dedicated bridges):** Governance (proposal metadata, role grants, vote timestamps); Processing (queue load, execution event metadata); Token Management (mint/burn events, supply drift); Ledger Anchoring (Merkle root updates, epoch hash checkpoints).
**Out of scope (hard-denied by architecture guards):** contract internal state, user account details, runtime call stacks, keys/secrets, consensus internals. "Limited-scope auditor, not a universal observer."

**Output:** logging is the only output ("cannot act — only witness and write"). Signed event objects in an append-only Merkle-linked oversight ledger; one-way non-binding integrity signals.

**Invariants:** no execution authority; signal/log only (cannot trigger halts/reverts/state changes); read-only metadata; limited scope; immutable logging; privacy (no wallet/user/raw-tx); does not initiate/vote.

## Machine spec (YAML)

```yaml
entity: AllSeeingEye
aka: TheAllSeeingEye
module: ast/extra_supervisory_layer
related_runtime: supervisory/anomaly_detection   # passive logging (no auto-rollback)
purpose: Architectural traceability via passive meta-observation; integrity signals.
principle: "witness, not judge"
cycle: [observe, log, compare, signal]

architectural_rules:
  passive_observation: "observes AST events with no execution rights"
  architecture_only_focus: "drift, coordination failures, structural anomalies"
  signal_emission_only: "may send alerts/signals, not commands"
  immutable_logging: "all observations timestamped, stored immutably"

observable_scope:        # read-only metadata via dedicated bridges
  governance: [proposal_metadata, role_grants, vote_timestamps]
  processing: [queue_load_metrics, execution_event_metadata]
  token_management: [mint_burn_events, supply_drift_indicators]
  ledger_anchoring: [merkle_root_updates, epoch_hash_checkpoints]

out_of_scope:            # hard denial via architecture-level guards
  - contract_internal_state
  - user_account_details
  - runtime_call_stacks
  - keys_secrets_auth_payloads
  - consensus_internals
rule: "limited-scope auditor, not a universal observer"

anomaly_categories:
  GOV-001..004: [proposal_without_quorum_anchor, vote_weight_mismatch, role_delegation_recursion]
  EXE-101..103: [transaction_replay, skipped_queue_entries, divergent_merkle_hash]
  TOK-201..203: [mint_without_proposal_link, supply_drift, burn_without_withdrawal_hash]
  VOL-301..303: [governance_traffic_surge, invalidation_spikes, overlapping_execution_events]
anomaly_storage: "each anomaly hashed -> Immutable Oversight Ledger"
ml_warnings: "off-chain models on anonymized metadata; require governance approval + audit"

logging:
  statement: "logging is the only output; cannot act, only witness and write"
  architecture: [append_only_merkle_linked_chain, ipfs_mirrored_logs, onchain_daily_digest_hash, observer_node_query_access]
  event_types: [anomaly_detected, scope_violation, heartbeat, integrity_signal, observer_join, observer_exit]
  privacy_excluded: [wallet_addresses, user_identifiers, raw_transaction_data, execution_context_internals]

signals:
  types:
    warning: minor inconsistency / early drift
    alert: confirmed anomaly within scope
    ping: passive health pulse
    scope_violation: attempt to exceed bounds
  properties: [read_only, non_binding, asynchronous, logged_first, optionally_broadcast]
  cannot: [trigger_halts, trigger_reverts, change_state]
  recipients: [observer_nodes, governance_audit_dashboards, external_analytics_log_mirrors]

observer_nodes:
  role: external read-only verifiers of Eye output
  can: [receive_signed_logs, verify_signatures, store_offchain_redundancy, report_to_external_governance_when_authorized]
  cannot: [vote, execute_logic, trigger_state_changes]
  rules:
    registration: "request + public key + governance/admin approval + nonce challenge"
    access: "signed headers + node authentication"
    trust: "uptime >= 95%, TLS, no spoofing, no event alteration"
    revocation: "protocol violation -> credentials revoked + blacklist"

data_model:
  OversightLogEntry: {eventType, layer, description, hash, prevHash, timestamp, signature}
  AnomalyRecord: {patternId, category, hash, timestamp}
  IntegritySignal: {type, payload, timestamp}
  ImmutableOversightLedger: append_only_merkle_linked

invariants:
  - id: I-EYE-1  rule: "witness, not judge: no execution authority; no state change/vote/halt"
  - id: I-EYE-2  rule: "signal/log only; signals cannot trigger halts/reverts/state changes"
  - id: I-EYE-3  rule: "read-only metadata access only"
  - id: I-EYE-4  rule: "limited scope; out-of-scope access hard-denied by guards"
  - id: I-EYE-5  rule: "immutable append-only Merkle-linked logging"
  - id: I-EYE-6  rule: "privacy: no wallet/user/raw-tx/execution internals logged"
  - id: I-EYE-7  rule: "does not initiate processes or issue commands"

prohibitions:           # negative tests
  - no_state_change
  - no_halt_or_revert
  - no_vote
  - no_command_issuance
  - no_mint_burn_control
  - no_out_of_scope_read

overclaims_to_flag:     # per Corrected AST Deep Dive runtime alignment
  - "anomaly layer triggers rollback"      # overclaim: logging only
  - "Eye actively enforces protocol rules" # overclaim/conflict: not an enforcement layer

ip_significance: [protocol_adjacent_oversight_layer, non_participatory_surveillance, meta_observer_kernel, drift_detector, deviation_scoring_layer, passive_meta_guardian, potential_trademark_IP]

dependencies:
  observes: [NodeChain, PoT, ArosCoin, Emission, Commission, StateRecording, Reserve, Release, Nodes, Bridge, Governance]
  emits_to: [ObserverNodes, audit_dashboards, external_mirrors]
  direction: "metadata in (read-only) -> signals/logs out; no control channel back"
```
