# Architecture Boundaries & Team Roles

This document outlines the major subsystems of the AROS-PARADIGM AST platform and the teams responsible for each. Clear boundaries help coordinate development and ensure stable interfaces between layers.

| Layer / Subsystem           | Primary Responsibilities                    | Owning Team              |
| --------------------------- | ------------------------------------------- | ------------------------ |
| Coin Engine                 | Emission protocol, volatility controls      | Tokenomics               |
| NodeChain Engine            | Node registration, sharding, consensus      | Core Protocol            |
| Token Management Layer      | Issuance, distribution, burn rules          | Smart Contract           |
| AROS Value Circulation      | Vaults, liquidity, reserves                 | Treasury                 |
| Bridge Layer                | Tokenization bridges, compliance interfaces | Integration & Compliance |
| Governance Layer            | Proposal lifecycle, quorum, permissions     | Governance               |
| Processing Layer            | TX queue, validation pipeline               | Ledger Ops               |
| Emission Layer              | Trigger conditions, flow pipeline           | Economics                |
| Crypto Ingestion Pipeline   | External crypto ingestion, conversion       | Bridge Ops               |
| Proof of Transaction Engine | TX validation, slashing                     | Consensus                |
| Validator Staking & Payments | Registration, performance scoring           | Validator Relations      |
| NodeChain AI Agents         | Anomaly detection, fraud signaling          | AI/ML                    |
| Extra Supervisory Layer     | Meta-monitoring, audit signals              | Oversight                |
| Decentralized TX Encoding   | Encoding governance and benchmarking        | Research                 |

Each team owns implementation within its boundary and exposes stable interfaces to adjacent layers.

## AST Architecture: Team Roles & Responsibilities

This document defines the high-level "squads" or teams responsible for developing and maintaining the AST Platform, based on the modular architecture.

### 1. Core Team: Nodechain (The "Engineers")

* **Modules:** 02, 07, 10, 11, 14
* **Focus:** The L1 "engine." Consensus, sharding, transaction processing, staking, and optimization.
* **Responsibilities:**
  * Maintaining the `Nodechain Engine (Module 02)`.
  * Optimizing the `Processing Layer (Module 07)` for TPS.
  * Implementing and balancing `Staking & Payments (Module 11)`.

## 2. Compliance Team: Bridge (The "Gatekeepers")

* **Modules:** 05, 09
* **Focus:** The "border" between the AST platform and the outside world (fiat and other cryptos).
* **Responsibilities:**
  * Maintaining the `Bridge Layer (Module 05)` and ALB.
  * Interfacing with 3rd-party KYC/AML partners.
  * Ensuring `ADR-003` (Regulatory Compliance) is enforced.

### 3. Economics Team: Treasury (The "Economists")

* **Modules:** 01, 03, 04, 08
* **Focus:** The on-chain economy and token lifecycle.
* **Responsibilities:**
  * Managing the `Token Management (Module 03)` contracts (`mint`, `burn`).
  * Implementing the `Emission Layer (Module 08)` logic.
  * Overseeing the `Value Circulation (Module 04)` policies (vaults, reserves).

### 4. Supervisory Team: AI (The "Watchmen")

* **Modules:** 12, 13
* **Focus:** The "All-Seeing Eye." Platform security and real-time monitoring.
* **Responsibilities:**
  * Developing and training the `AI Agents (Module 12)`.
  * Maintaining the `Anomaly Detection Engine` and `Fraud Signal Dispatcher`.
  * Operating the `Supervisory Layer (Module 13)` for meta-auditing.

### 5. Governance Team (The "Guardians")

* **Modules:** 06
* **Focus:** On-chain governance and emergency response.
* **Responsibilities:**
  * Maintaining the `Governance Layer (Module 06)` contracts (voting, proposals).
  * Acting as the multi-sig holders for `Emergency Procedures (ADR-005)`.
  * Managing platform upgrades and parameter changes.
