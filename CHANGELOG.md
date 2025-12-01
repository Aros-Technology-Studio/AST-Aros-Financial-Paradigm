# CHANGELOG.md for AROS Studio Tokenomics (AST)

This CHANGELOG tracks significant changes, updates, and releases for the AST repository. Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format and uses semantic versioning (SemVer).

## [Unreleased]
### Added
- Ongoing refinements to documentation templates for consistency across layers.
- Potential integrations for ML in anomaly detection (pending review).

### Changed
- Standardized all documentation to English for international accessibility.

### Fixed
- Resolved minor inconsistencies in file naming and cross-references.

## [1.0.0] - 2025-08-16
### Added
- Full repository structure with 14 layers, including Coin Engine, NodeChain, Governance, Processing, Emission, Bridges, and The All-Seeing Eye.
- Global files: README.md, glossary.md, deployment_guide.md, economic_simulation.md (with Python code), threat_model_global.md, and roadmap.md.
- Solidity contracts (e.g., token_generation_contract.sol) and JSON specs (e.g., AROS_Coin_TokenSpec.json).
- Mermaid diagrams for flows, tables for comparisons, and JSON examples throughout docs.
- Test frameworks (e.g., pytest for Python modules) and Hardhat setup for Solidity.
- AI agent stubs and PoT validation logic in Python.

### Changed
- Unified duplicates (e.g., merged multiple PoT and Coin Engine PDFs into single blocks).
- Translated Russian sections to English for uniformity.
- Expanded truncated PDF sections with logical completions (e.g., added failure modes, invariants).

### Fixed
- Filled "🆕 создать" placeholders with complete specs and code (e.g., coin_emission_model.md with formulas).
- Added missing cross-links between layers (e.g., bridges to emission for mint triggers).

## [0.9.0] - 2025-08-12 (Initial Draft from PDFs)
### Added
- Compiled core documentation from provided PDFs (e.g., AST Processing Layer, Emission Layer, Bridges).
- Basic templates for Python code (FastAPI, Pydantic models) in processing and governance layers.
- Initial Solidity prototypes for token management.

### Changed
- Organized into modular folders based on AST blocks.

### Fixed
- Addressed language mix (RU/EN) by standardizing to EN in overviews.

## [0.1.0] - 2025-07-05 (Bootstrap)
### Added
- Initial skeleton from project specs: Overviews for PoT, AI Agents, NodeChain.
- pyproject.toml, Makefile, and .env templates for dev environment.

For detailed commit history, see the Git log. Contributors: Lisa, Kotov, with AI assistance from Grok.

## **\[1.0.0\] \- 2025-11-02**

### **Added**

* **Core Architecture:** Defined the complete modular structure (Modules 01-14).  
* **Documentation:** Created the docs/ directory with ADRs, API specs, and Guides.  
* **Legal:** Added docs/legal section with Provisional Patent summaries.  
* **ADRs:** Formalized key architectural decisions (ADR-001 to ADR-006).  
* **API:** Defined OpenApi specs for Nodechain, Bridge, and AI Agents.

### **Changed**

* Refactored repository structure to align with the "Swiss Watch" modular philosophy.  
* Updated README.md to reflect the new strategic vision.
