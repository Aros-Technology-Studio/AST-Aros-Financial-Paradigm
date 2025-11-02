# AST Platform: Module Map

This document serves as a high-level map and quick-reference guide for all functional modules within the Aros Studio (AST) Platform. It provides a brief description of each module's core responsibility.

For a detailed breakdown of how these modules interact, see the **[Architecture Overview](./Architecture_Overview.md)**.

| Module ID | Module Name | Core Responsibility (One-Line Summary) | Key Source File (Reference) |
| :--- | :--- | :--- | :--- |
| **01** | **Coin Engine** | *(Deprecated)*. Defines the foundational economic concepts and specs. | `AROS_Coin_TokenSpec.json` |
| **02** | **Nodechain Engine** | The core L1 blockchain: manages consensus (ADR-001), node identity, and sharding (ADR-004). | `network_consensus_model.md` |
| **03** | **Token Management** | The on-chain contracts that control token lifecycle: `mint`, `burn`, `lock`, `freeze`. | `token_issuance_protocol.md` |
| **04** | **Value Circulation** | Defines the economic models: vaults, reserve policies, and internal liquidity mechanisms. | `value_circulation_overview.md` |
| **05** | **Bridge Layer** | The mandatory regulatory gateway (ADR-003). Manages all fiat/crypto entry/exit via the ALB. | `kyc_aml_interface_bridge.md` |
| **06** | **Governance Layer** | Manages on-chain voting, proposals, and emergency "circuit-breaker" procedures (ADR-005). | `governance_layer_overview.md` |
| **07** | **Processing Layer** | The "engine room" that handles the TX queue, validation pipeline, and audit logging (ADR-006). | `tx_validation_pipeline.md` |
| **08** | **Emission Layer** | The protocol-level controller for token supply, minting new tokens based on network epochs. | `epoch_allocation_model.md` |
| **09** | **Crypto Ingestion** | A specialized sub-bridge for handling crypto-to-crypto swaps (e.g., wBTC -> AST asset). | `External Crypto Ingestion.md` |
| **10** | **Proof-of-Transaction** | A novel consensus contribution mechanism that weights and incentivizes transactions. | `pot_engine_overview.md` |
| **11** | **Staking & Rewards** | Manages validator staking, performance scoring (`Validator_performance_score.md`), and penalties. | `staking_overview.md` |
| **12** | **Nodechain AI Agents** | The **active** AI supervisory layer (ADR-002) that scores risk and dispatches fraud signals. | `agent_architecture.md` |
| **13** | **Supervisory Layer** | The **passive** "All-Seeing Eye" layer that provides meta-auditing of the entire system. | `the_all_seeing_eye_overview.md` |
| **14** | **TX Encoding** | Defines the high-efficiency, standardized binary encoding format for all network transactions. | `decentralized_tx_encoding.md` |
