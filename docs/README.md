# AST (Aros Studio) Platform Documentation

Welcome to the central documentation hub for the AST Foundational Platform.

This documentation provides a complete technical and conceptual overview of the "Swiss Watch" architecture, designed as a high-performance, secure, and regulatory-native infrastructure for institutional finance.

## 1. Conceptual Overview

Start here to understand the "Why" and "What" of the AST Platform.

* **[AST Whitepaper](./conceptual/AST_Whitepaper.md)**: The core vision, problem statement, and solution.
* **[Glossary](./glossary.md)**: A complete dictionary of all specific terms (e.g., "Nodechain", "ALB", "Proof-of-Processing").

## 2. Architecture

Detailed design decisions and blueprints for the platform.

* **[Architecture Overview](./architecture/Architecture_Overview.md)**: A high-level view of all modules and how they interact.
* **[Module Map](./architecture/Module_Map.md)**: A map linking all 14+ system modules.
* **[Sequence Diagrams](./architecture/sequence_diagrams.md)**: (WIP) Visual flows for key processes (e.g., Transaction Lifecycle, KYC Tokenization).

### Architectural Decision Records (ADRs)

The formal arguments for *why* the system is built this way.

* **[ADR-001: Network Consensus Model](./adr/ADR-001-Network_Consensus_Model.md)**
* **[ADR-002: AI Supervisory Framework](./adr/ADR-002-AI_Supervisory_Framework.md)**
* **[ADR-003: Regulatory Compliance Bridge](./adr/ADR-003-Regulatory-Compliance-Bridge.md)**
* **[ADR-004: Network Sharding Strategy](./adr/ADR-004-Network-Sharding-Strategy.md)**
* **[ADR-005: Emergency Governance Procedures](./adr/ADR-005-Emergency-Governance-Procedures.md)**
* **[ADR-006: Multi-Layered Audit Trail](./adr/ADR-006-Multi-Layered-Audit-Trail.md)**

## 3. Developer Guides

Practical guides for integration and development.

* **[Getting Started: Local Setup](./getting_started/local_setup_guide.md)**: (WIP) How to run a local node.
* **[Contribution Guide](./standards/Contribution_Guide.md)**: Standards for contributing code.

## 4. API Reference

Detailed specifications for all internal and external APIs.

* **[Nodechain API (Module 02)](./api/module_02_nodechain.md)**: (WIP) Node registration, consensus, etc.
* **[Bridge Layer API (Module 05)](./api/module_05_bridge.md)**: (WIP) Tokenization, KYC requests.
* **[AI Agents API (Module 12)](./api/module_12_ai_agents.md)**: (WIP) Fetching risk scores, subscribing to fraud signals.

## 5. Security & Compliance

* **[Global Threat Model](../threat_model_global.md)**: The master list of threats the system is designed to mitigate.
* **[Security Standard](./security/Security_Standard.md)**: Core security policies and best practices.
