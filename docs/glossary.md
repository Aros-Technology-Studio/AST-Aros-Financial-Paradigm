# Glossary
A comprehensive dictionary of terms used in the Aros Studio (AST) ecosystem.

### A

* **ADR (Architecture Decision Record)**
    * A formal document that captures a key architectural decision, its context, and its consequences. (See `/docs/adr`).

* **AFC (Aros Financial Coin)**
    * A non-speculative, fiat-referenced financial asset (product) designed to be serviced by the AST Platform.

* **AI Agent**
    * An autonomous, specialized AI process that monitors, audits, or acts upon network activity. (See Module 12).

* **ALB (Aros Logic Bridge)**
    * A component of the Bridge Layer responsible for connecting off-chain logic (like KYC providers) to the on-chain platform.

* **Aros Studio (AST)**
    * The foundational, regulatory-native infrastructure platform ("Swiss Watch") designed to service institutional-grade financial products.

### B

* **Bridge Layer (Module 05)**
    * The architectural layer (ADR-003) that acts as a mandatory gateway for all value entering or exiting the AST platform, enforcing KYC/AML compliance.

### C

* **Compliance Oracle**
    * A trusted system component (part of the Bridge Layer) that interfaces with 3rd-party KYC providers to approve or deny transactions.

* **Consensus (Proof-of-Processing)**
    * The unique consensus mechanism of the AST Nodechain (ADR-001). Nodes are paymented for verifiably *processing* transactions, not just staking capital.

### F

* **Fraud Signal**
    * An alert dispatched by an AI Agent (Module 12) when it detects a high-probability threat, often triggering an escalation to Governance (ADR-005).

### G

* **Governance (Module 06)**
    * The layer responsible for managing system parameters, executing emergency procedures, and voting on platform upgrades.

### K

* **KYC / AML (Know Your Customer / Anti-Money Laundering)**
    * The mandatory regulatory identity verification process enforced by the Bridge Layer (ADR-003).

### N

* **Nodechain (Module 02)**
    * The core decentralized network (blockchain) of the AST platform. It is a sharded, high-performance engine.

* **Node (Validator)**
    * A network participant that authenticates transactions and participates in consensus.

* **Node (Shard)**
    * A network participant that processes transactions and state for a specific shard.

* **Node (Observer)**
    * A passive node that audits chain state and contributes to node reputation scoring.

### Q

* **Quorum**
    * The minimum number of weighted votes (≥ 67%) required for validator nodes to reach consensus on a decision (ADR-001).

### R

* **Reverse Tokenization**
    * The process of converting an AST-based asset (like AFC) back into its off-chain fiat equivalent via the Bridge Layer.

### S

* **Shard**
    * A logical partition of the Nodechain's state and processing load, enabling parallel execution and horizontal scalability (ADR-004).

### T

* **The All-Seeing Eye (Module 13)**
    * The conceptual name for the extra supervisory layer (ADR-002) that provides passive, real-time monitoring and meta-auditing of the entire platform.

* **Tokenization**
    * The process of converting an off-chain asset (like fiat currency) into a digital token on the AST platform via the Bridge Layer.
