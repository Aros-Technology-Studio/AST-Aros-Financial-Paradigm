# AST — System Requirements Specification (SRS)

**Version:** 1.0  
**Owner:** qetevanarotato-star  
**Status:** Stable  

---

## 1. Purpose & Scope
The **Aros Studio Tokenomics (AST)** system defines the crypto-side architecture of the AROS Financial Core.  
This document specifies the **functional, non-functional, and compliance requirements** for AST, which operates as the **crypto operator** under the AFC umbrella, connected to ALB (Aros Liquidity Banking) through a regulated API contract.

**Scope includes:**
- Token emission, burn, circulation, staking and PoT validation.
- Transaction processing lifecycle and rollback model.
- Bridge interactions for fiat ↔ tokenized conversions.
- Compliance hooks for KYC/AML via ALB.

**Out of scope:**
- User-level KYC operations (handled by ALB).
- Fiat custody and regulatory reporting.

---

## 2. References
- `docs/architecture/Architecture_Overview.md`
- `docs/architecture/AST_AFC_Interface.md`
- `docs/requirements/schemas/*.json`
- ISO/IEC 27001, PSD2, GDPR, KVKK.

---

## 3. Stakeholders
| Role | Responsibility |
|------|----------------|
| Product Owner | Defines release targets and functional scope. |
| Lead Blockchain Engineer | Implements tokenomics and PoT layers. |
| DevOps / Infra | Manages deployment, CI/CD, monitoring. |
| Security Officer | Zero-trust policy enforcement, key rotation, compliance. |
| Auditors | Review transaction logs and compliance evidence. |

---

## 4. System Overview
AST is a **modular blockchain-based execution layer** integrated into the AROS ecosystem.  
It processes transactions, governs token emission and rewards, validates operations via Proof of Transaction (PoT), and maintains auditability and rollback integrity.  

AST is designed to function autonomously while staying compliant through the ALB interface.

---

## 5. Functional Requirements (FR)

### 5.1 Coin Engine
- **FR-CE-01 — Controlled Emission:** Token emission follows `AROS_Coin_TokenSpec.json` with epoch-based caps.  
- **FR-CE-02 — Burn/Mint Rules:** Only governance-approved events trigger mint or burn operations; every event recorded in `AuditLogEntry`.  

### 5.2 NodeChain Engine
- **FR-NC-01 — Node Registration:** Each node must sign with its identity and declare a role (validator, auditor, observer).  
- **FR-NC-02 — Sharding Logic:** Transactions are assigned to shards per epoch; cross-shard activity prohibited during active epoch.

### 5.3 Token Management
- **FR-TM-01 — Lock/Unlock:** Tokens may be locked with a TTL and associated metadata, visible in audit log.  
- **FR-TM-02 — Freeze Protocol:** Governance quorum can freeze token sets in emergencies.

### 5.4 Value Circulation
- **FR-VC-01 — Vault Accounting:** Vaults operate as isolated liquidity pools with deterministic rules.  
- **FR-VC-02 — Entry/Exit Flow:** Bridge synchronization with ALB validates KYC status before circulation updates.

### 5.5 Bridge Layer
- **FR-BR-01 — Tokenization:** Convert fiat entries into ArosCoin when ALB sends signed KYC-approved requests.  
- **FR-BR-02 — Reverse Tokenization:** Validate outbound requests against original transaction ID and risk score ≥ threshold.  
- **FR-BR-03 — Audit Consistency:** Each tokenization must link to both the ALB signature and the AST transaction hash.

### 5.6 Governance
- **FR-GV-01 — Proposals:** New parameters introduced through proposal submission, quorum voting, and time-lock validation.  

### 5.7 Processing Layer
- **FR-PL-01 — Transaction Queue:** All TXs must enter a structured queue with TTL, priority, and deduplication.  
- **FR-PL-02 — Validation Pipeline:** Transaction validation includes structure, PoT weight, and anti-tamper controls.  
- **FR-PL-03 — Audit Log:** Every step logged into immutable, replayable audit trail.

### 5.8 Emission
- **FR-EM-01 — Triggered Emission:** New coins are emitted only when epoch conditions and validator votes are satisfied.  

### 5.9 Crypto Ingestion
- **FR-CI-01 — TX Normalization:** All external transactions normalized to internal AST schema format.  

### 5.10 Proof of Transaction (PoT)
- **FR-POT-01 — Weighted Validation:** PoT weights calculated according to `pot_tx_weighting_model.md`.  

### 5.11 Staking & Rewards
- **FR-SR-01 — Slashing Mechanism:** Validators penalized for provable faults; slashing recorded in AuditLog.  

### 5.12 AI Agents
- **FR-AI-01 — Anomaly Detection:** AI agents can flag abnormal transaction patterns, but cannot modify balances.  

### 5.13 Supervisory Layer (All-Seeing Eye)
- **FR-SV-01 — Integrity Signaling:** Observer nodes emit out-of-band integrity signals; no write privileges to ledger.  

### 5.14 Decentralized TX Encoding
- **FR-DTE-01 — Governance Upgradability:** Upgrades occur only through approved governance proposals.

---

## 6. Non-Functional Requirements (NFR)
| ID | Requirement | Target |
|----|--------------|--------|
| NFR-SEC | Zero-trust architecture, encrypted API, key isolation. | Mandatory |
| NFR-PERF | ≤250 ms TX validation (p95), 99.95% uptime. | High |
| NFR-OBS | Structured JSON logging, trace ID on all TX. | High |
| NFR-COMP | GDPR/KVKK compliant data flow (no PII storage). | Critical |
| NFR-RES | Full deterministic rollback per epoch. | Critical |

---

## 7. Data & Interfaces
- **Data Entities:** Transaction, Epoch, Vault, RiskScore, GovernanceEvent.  
- **Schemas:** Stored under `docs/requirements/schemas/*.json`.  
- **APIs:**  
  - `tokenize` — receive KYC-approved fiat deposits.  
  - `reverse_tokenize` — convert back to fiat.  
  - `updateRiskScore` — refresh ALB risk context.  
  - `syncClock` — synchronize timestamps and epoch IDs.

---

## 8. Security Requirements
- Signed requests (RSA-4096 or ECDSA-secp256k1).  
- mTLS between ALB and AST.  
- Key rotation every 90 days.  
- Rollback log immutable; tamper detection triggers kill switch.  

---

## 9. Operational Requirements
- **Environment Parity:** dev = staging = prod.  
- **Monitoring:** Alert on TX queue delay, bridge timeout, emission anomalies.  
- **Backups:** Audit and Epoch states archived every 24h.  

---

## 10. Acceptance Criteria
- Valid TX with TTL expired → rejected.  
- Tokenization without signed ALB approval → rejected.  
- PoT weight recalculation consistent across restarts.  
- Governance proposal visible in audit log.  

---

## 11. Traceability Matrix
| FR | Implementation | Test |
|----|----------------|------|
| FR-PL-01 | `src/processing_layer/queue_handler.ts` | `tests/test_processing_pipeline.py` |
| FR-BR-01 | `src/bridge_layer/tokenize.ts` | `tests/test_bridge.py` |
| FR-CE-01 | `src/coin_engine/emission.ts` | `tests/test_emission.py` |

---

## 12. Change Control
All modifications to SRS must be done via Pull Request with a linked ADR.  
Approved changes are logged in `CHANGELOG.md`.

---

**End of Document**

