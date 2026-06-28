# AST Platform: Security Standard

This document defines the mandatory security policies, principles, and standards for all code, infrastructure, and operations within the AST ecosystem. The platform's "Swiss Watch" concept is built on a foundation of security-first engineering.

All development must adhere to these standards.

## 1. Core Principles

1.  **Zero Trust:** No component (on-chain or off-chain) is trusted by default. All API calls, node connections, and bridge requests must be authenticated and authorized.
2.  **Defense in Depth:** Security is layered. A failure in one layer (e.g., a smart contract bug) must be caught by another (e.g., the AI Supervisory Layer, ADR-002).
3.  **Mandatory Compliance:** All value entering or exiting the platform *must* pass through the `Regulatory Compliance Bridge` (ADR-003). There are no backdoors.
4.  **Full Auditability:** All state-changing actions (TXs, governance, minting, AI actions) *must* be immutably logged (ADR-006).

## 2. Threat Models
All new features or code changes must be evaluated against the following threat models:
* **[Global Threat Model](../threat_model_global.md)**: The master document for platform-wide risks.
* **[Nodechain Security Model](../02_nodechain_engine/nodechain_security_model.md)**: Risks related to consensus, sharding, and P2P networking.
* **[Bridge Threat Model](../05_bridge_layer/bridge_threat_model.md)**: Risks related to the ALB, fiat/crypto "double spend," and KYC provider failure.
* **[DTE Security Model](../14_decentralized_tx_encoding/dte_security_threat_models.md)**: Risks related to malicious or malformed transaction data.

## 3. Mandatory Standards

### 3.1. Smart Contract & Token (Module 03)
* **Upgradability:** All core contracts must use a Proxy Pattern (`contract_upgrade_proxy.md`) to allow for emergency bug fixes.
* **Ownership:** Contract ownership must be held by the `Governance Layer (Module 06)`, not by a single individual (EOA).
* **Self-Destruct:** The `selfdestruct` opcode is **PROHIBITED** in all contracts (`contract_self_destruct_policy.md`).
* **Auditing:** No token-related contract can be deployed to production without a full, independent, 3rd-party security audit.

### 3.2. API & Infrastructure
* **Authentication:** All internal and external API endpoints (Module 02, 05, 12, Public API) must be protected. Unauthenticated endpoints are not permitted.
* **Schema Validation:** All API inputs *must* be strictly validated against their corresponding JSON schema (e.g., `transaction.schema.json`). `"additionalProperties": false` is the required standard.
* **Data Encryption:** All data in transit must be encrypted. All sensitive data at rest (e.g., user PII held by an ALB partner) must be encrypted. (See `encryption_protocol.md`).

### 3.3. Emergency Response
* **Circuit Breakers:** The system must adhere to the `Emergency Governance Procedures` (ADR-005).
* **AI Escalation:** The `AI Governance Escalation` path (`ai_governance_escalation.md`) must be tested regularly.
* **Rollbacks:** All critical processes (e.g., emission, TX processing) must have a documented rollback strategy (`emission_rollbacks_and_freeze_rules.md`, `tx_rollback_strategy.md`).
