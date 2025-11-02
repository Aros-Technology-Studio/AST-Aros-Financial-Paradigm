# AST Architecture Overview

This document outlines the high-level architecture of the AST system, detailing its modular components, boundaries, and primary data flows. This serves as the primary "map" for navigating the platform's design.

---

## 1. Modular Components

The AST Platform is a modular, layered system. Each numbered module represents a distinct, encapsulated set of responsibilities.

* **Module 01: Coin Engine**
    * *DEPRECATED/Reference.* Defines the conceptual economic model and emission protocols. (Superceded by Module 08).
* **Module 02: Nodechain Engine**
    * The core L1 blockchain layer. Manages consensus (ADR-001), node authentication, and sharding (ADR-004).
* **Module 03: Token Management Layer**
    * Handles the on-chain smart contracts for all token operations: `mint`, `burn`, `lock`, `freeze`.
* **Module 04: Aros Value Circulation**
    * Defines the economic models for value flow, including vaults, reserve policies, and liquidity pools.
* **Module 05: Bridge Layer**
    * The mandatory regulatory gateway (ADR-003). Manages all value in/out of the system, including KYC/AML checks via the Aros Logic Bridge (ALB).
* **Module 06: Governance Layer**
    * Manages on-chain governance, including proposals, voting, and emergency procedures (ADR-005).
* **Module 07: Processing Layer**
    * The "engine room" for transactions. Manages the TX queue, validation pipeline, and writing to audit logs (ADR-006).
* **Module 08: Emission Layer**
    * The protocol-level system that controls the release of new tokens based on network epochs.
* **Module 09: Crypto Ingestion Pipeline**
    * A sub-component of the Bridge Layer (Module 05) designed to handle crypto-to-crypto (e.g., BTC/ETH to AST) conversions.
* **Module 10: Proof-of-Transaction Engine**
    * A novel mechanism for weighting transactions and rewarding network participation.
* **Module 11: Validator Staking & Rewards**
    * Manages the economic incentives for nodes, including performance scoring and slashing rules.
* **Module 12: Nodechain AI Agents**
    * The *active* supervisory layer (ADR-002). A federation of AI agents that monitor, score risk, and dispatch fraud signals.
* **Module 13: Extra Supervisory Layer**
    * The *passive* supervisory layer ("The All-Seeing Eye"). Provides high-level meta-auditing of the entire system, including the AI agents themselves.
* **Module 14: Decentralized TX Encoding**
    * Defines the standardized, efficient data encoding format used for all network messages and transactions.

---

## 2. System Boundaries (AST vs. ALB)

This is the most critical architectural boundary, separating the crypto and fiat domains.

* **AST (Aros Studio Platform)**
    * **Domain:** The "Crypto Operator."
    * **Responsibility:** Manages all **on-chain** logic. This includes the Nodechain, consensus, smart contracts, token minting, and the on-chain `Compliance Oracle`. It is a self-contained, deterministic, and auditable system.

* **ALB (Aros Logic Bridge)**
    * **Domain:** The "Fiat Operator."
    * **Responsibility:** Manages all **off-chain** logic and acts as the trusted intermediary to the traditional world. It is run by trusted partners (e.g., banks, financial institutions).
    * **Functions:**
        1.  Listens to off-chain KYC providers and confirms user identities.
        2.  Verifies receipt of off-chain fiat deposits.
        3.  Cryptographically signs the `bridge_request` (see `bridge_request.schema.json`) and submits it to the AST `Compliance Oracle` (Module 05) to authorize tokenization.

This separation allows the on-chain (AST) system to remain fully transparent and deterministic, while isolating the complexities and trust assumptions of the off-chain (ALB) fiat world.

---

## 3. Primary Data Flows

These are the three most important processes in the system.

### 1. Transaction (TX) Lifecycle
* **Description:** The flow of a standard user-to-user transaction.
* **Flow:** This process is detailed in the **[Standard Transaction Lifecycle Diagram](./sequence_diagrams.md)**.
* **Modules Involved:** `Node API (AST_API_Spec.md)`, `Module 07 (Processing)`, `Module 12 (AI Agents)`, `Module 02 (Consensus)`.

### 2. Bridge In/Out (Tokenization)
* **Description:** The flow of value *into* the system from the fiat world (Tokenization) and *out of* the system (Reverse Tokenization).
* **Flow:** This process is detailed in the **[Fiat-to-AST Tokenization Lifecycle Diagram](./sequence_diagrams.md)**.
* **Modules Involved:** `Module 05 (Bridge/ALB)`, `3rd-Party KYC Provider`, `Module 03 (Token Management)`.

### 3. Emission Epochs
* **Description:** The protocol-level flow for issuing new tokens based on network time (epochs).
* **Flow:**
    1.  The **Nodechain (Module 02)** reaches a new `epochId` (see `epoch.schema.json`).
    2.  This change triggers the **Emission Layer (Module 08)**.
    3.  The **Emission Layer** calculates the new token allocation for this epoch based on the `epoch_allocation_model.md`.
    4.  It calls the `mint()` function on the **Token Management (Module 03)** contract.
    5.  The new tokens are minted to their target addresses (e.g., validator reward pools, governance treasury).
    6.  The **Token Management (Module 03)** writes this action to the `token_audit_trail.md` (ADR-006) for auditors.
