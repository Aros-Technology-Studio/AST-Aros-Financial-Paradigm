# AST – System Requirements Specification (SRS)
Version: 0.1-draft | Owner: qetevanarotato-star

## 1. Scope & Purpose
- Define mandatory behavior of AST (Aros Tokenomics) independent of implementation.
- In/Out of scope: tokenomics core (in), ALB banking internals (out, via API contract only).

## 2. References
- Glossary: /glossary.md
- Architecture: repo root; modules 01–14
- Legal: PSD2/OpenBanking, AML/KYC, GDPR/KVKK (constraints)

## 3. Stakeholders & Roles
- Product owner (AFC), Dev leads (AST), Security, Compliance, DevOps, Auditors.

## 4. Definitions & Assumptions
- ALB = fiat operator via API only; AST = crypto operator; PoT = Proof of Transaction.
- No end-user accounts inside AFC (internal system).

## 5. System Overview
- 01 Coin Engine, 02 NodeChain, 03 Token Management, 04 Value Circulation, 05 Bridge, 
  06 Governance, 07 Processing, 08 Emission, 09 Crypto Ingestion, 10 PoT, 
  11 Staking/Rewards, 12 AI Agents, 13 Supervisory Layer (All-Seeing Eye), 14 DTE.

## 6. Functional Requirements
6.1 Coin Engine
  FR-CE-01 Emission must follow AROS_Coin_TokenSpec.json.
  FR-CE-02 Burn/mint rules enforce supply ceilings with rollback hooks.
6.2 NodeChain
  FR-NC-01 Node registration requires signed identity + role assignment.
  FR-NC-02 Sharding must keep TX locality within epoch boundaries.
6.3 Token Management
  FR-TM-01 Lock/unlock with on-chain audit trail.
  FR-TM-02 Emergency freeze callable only by Governance quorum.
6.4 Value Circulation
  FR-VC-01 Vault accounting isolated per pool; reserve policy enforced.
  FR-VC-02 Entry/exit rules mapped to Bridge constraints.
6.5 Bridge Layer
  FR-BR-01 Tokenization API enforces KYC/AML decision from ALB only.
  FR-BR-02 Reverse tokenization requires matched TX proof + risk score.
6.6 Governance
  FR-GV-01 Proposal lifecycle with quorum, time-locks, emergency path.
6.7 Processing Layer
  FR-PL-01 TX queue prioritization with TTL and rollback strategy.
  FR-PL-02 Audit log must be immutable and replayable.
6.8 Emission Layer
  FR-EM-01 Triggers parametrized per epoch with fraud prevention gates.
6.9 Crypto Ingestion
  FR-CI-01 Normalize external TX, map to AROS conversion pipeline.
6.10 PoT Engine
  FR-POT-01 Weighting model per pot_tx_weighting_model.md.
6.11 Staking & Rewards
  FR-SR-01 Slashing on provable misbehavior; epoch commitments required.
6.12 AI Agents
  FR-AI-01 Anomaly detection emits audit traces; no fund control.
6.13 Supervisory Layer
  FR-SV-01 Observer node emits integrity signals; out-of-band only.
6.14 DTE
  FR-DTE-01 Governance-controlled upgrades; conformance tests required.

## 7. Non-Functional Requirements
NFR-Sec Zero-trust, key mgmt, API allowlist, kill switch, GDPR/KVKK.
NFR-Perf P95 TX validation < 250 ms; throughput targets per shard.
NFR-Res 99.95% availability; crash-only recovery; deterministic replays.
NFR-Obs Structured logs, trace IDs, audit proofs exportable.
NFR-Comp Evidence packs for AML/KYC; data minimization.

## 8. Data & Interfaces
- Data model: TX, Epoch, Vault, RiskScore, GovernanceEvent.
- External APIs: ALB ↔ AST JSON contract (tokenize, reverse_tokenize, updateRiskScore, syncClock).
- Events: audit topics and replay streams.

## 9. Security Requirements
- Auth: signed requests (mTLS or keypair), per-service scopes.
- RBAC: governance vs ops vs audit; no cross-write between ALB/AST.
- Rollback policy: deterministic; human-approved via Governance.

## 10. Operational Requirements
- Environments: dev/stage/prod parity.
- CI/CD: build, lint, tests; reproducible artifacts.
- Monitoring: SLOs, alerts for emission triggers and bridge failures.

## 11. Acceptance Criteria
- End-to-end TX lifecycle passes: enqueue → validate → execute → audit → PoT → finalize.
- Tokenization/Reverse flows verified with mocked ALB.
- All FR/NFR mapped to tests; evidence attached.

## 12. Traceability Matrix (sample)
FR-PL-01 → 07_processing_layer/tx_queue_handler.md, tests/tx_queue_handler.spec.ts  
FR-BR-01 → 05_bridge_layer/tokenization_bridge_architecture.md, api/bridge.spec.ts

## 13. Open Issues & Risks
- Bridge liquidity routing under stress.
- Governance emergency procedures timing.

## 14. Change Control
- Every SRS change via PR + ADR reference; versioned in CHANGELOG.md.
