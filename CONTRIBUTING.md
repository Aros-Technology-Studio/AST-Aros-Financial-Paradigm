# CONTRIBUTING.md for AROS Studio Tokenomics (AST) Repository

As the Lead Blockchain Developer and Tokenomics Designer for AST, with expertise in realizing custom consensus mechanisms like PoT and architectures such as NodeChain, I emphasize that contributions must advance AST's utility-driven, non-speculative model while maintaining architectural integrity. Drawing from my role as Institutional Relations Lead and Regulatory Strategist, this guide ensures all inputs comply with financial regulations (e.g., AML/KYC, PSD2) and support integrations with central banks and GovTech ecosystems. As PR Director and Strategic Narrative Builder, we frame contributions as building "financial architecture of the future," not "just another fintech." As Patent Attorney and Privacy Counsel, protect IP and data privacy in every pull request (PR). As Technical Program Manager, enforce modular, testable code aligned with our multi-layer structure.

This CONTRIBUTING guide is inspired by open-source standards (e.g., Apache, Contributor Covenant) but customized for AST's GovTech and FinTech focus. We welcome contributions from developers, economists, regulators, and UX researchers to foster ethical, scalable tokenomics.

## Table of Contents
- [How to Contribute](#how-to-contribute)
- [Contribution Types](#contribution-types)
- [Guidelines](#guidelines)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Code Style and Standards](#code-style-and-standards)
- [Testing and Quality Assurance](#testing-and-quality-assurance)
- [Legal and Compliance](#legal-and-compliance)
- [Community and Communication](#community-and-communication)
- [Acknowledgments](#acknowledgments)

## How to Contribute
AST thrives on collaborative input to refine its layers (e.g., Coin Engine, Bridges, AI Agents). Whether fixing a bug in PoT weighting or proposing a governance tweak via economic simulations, your contributions help embed AST in national strategies and CBDC pilots.

1. **Fork the Repository**: Click "Fork" on GitHub to create your copy.
2. **Clone Locally**: `git clone https://github.com/yourusername/aros-tokenomics.git`.
3. **Create a Branch**: Use Conventional Commits naming: `git checkout -b feat/07-queue-add-ttl` (e.g., feat for features, fix for bugs, docs for documentation).
4. **Make Changes**: Follow the guidelines below.
5. **Commit**: `git commit -m "feat(01-coin-engine): add emission formula with burn ratio"`.
6. **Push**: `git push origin feat/07-queue-add-ttl`.
7. **Open a PR**: From your fork, create a Pull Request to the main repo's `main` branch.

As UX Researcher, ensure changes enhance user scenarios (e.g., seamless fiat ingress for urban services). As Revenue Model Architect, validate economic impacts.

## Contribution Types
- **Code**: Solidity for contracts (e.g., mint/burn in Coin Engine), Python for backend (e.g., FastAPI in Processing Layer).
- **Documentation**: Update .md files (e.g., add Mermaid diagrams to bridge flows) or expand glossary.md.
- **Tests**: Add pytest for Python, Hardhat for Solidity (coverage >80%).
- **Bug Reports/Issues**: Use GitHub Issues with labels (e.g., "bug:pot-slashing", "enhancement:ai-escalation").
- **Governance Proposals**: Suggest parameter changes (e.g., emission ratios) backed by simulations from economic_simulation.md.
- **Audits/Reviews**: As Security Engineer, contribute Slither scans or threat model expansions.
- **UX/Design**: Wireframes or scenarios for token circulation (e.g., vault UX for cities).

Avoid speculative features (e.g., no yield farming)—focus on utility, compliance, and GovTech alignment.

## Guidelines
- **Respect the Architecture**: Changes must align with NodeChain (not blockchain), PoT consensus, and zero-trust boundaries. Reference glossary.md for terms.
- **Ethical Focus**: As FinReg Legal Advisor, ensure no code violates AML/KYC or data privacy (e.g., anonymize logs).
- **Modularity**: Place code in correct folders (e.g., py/ for Python in 07_processing_layer/).
- **Inclusivity**: Follow CODE_OF_CONDUCT.md—harassment-free, empathetic collaboration.
- **IP Protection**: As Patent/IP Architect, disclose if your contribution involves patented ideas; AST uses MIT License but reserves core IP.

## Development Setup
As DevOps Engineer, follow these steps for a consistent environment:
1. **Prerequisites**: Node.js v18+, Python 3.11+, Docker, Git.
2. **Clone and Install**:
   ```bash
   git clone https://github.com/aros-studio/aros-tokenomics.git
   cd aros-tokenomics
   npm install --save-dev hardhat @openzeppelin/contracts ethers
   pip install -r requirements.txt  # For Python deps like FastAPI, Pydantic
   ```
3. **Hardhat Init** (for Solidity): `npx hardhat --init` (JavaScript project).
4. **Database/Queues**: Run PostgreSQL/Redis via Docker:
   ```bash
   docker-compose up -d postgres redis
   alembic upgrade head  # For schema migrations
   ```
5. **Run Locally**:
   - Solidity: `npx hardhat compile && npx hardhat test`.
   - Python API: `uvicorn 07_processing_layer.api.app:app --reload`.
6. **Extensions in VS Code**: Solidity, Python, Hardhat Solidity, Prettier.

For full setup, see deployment_guide.md.

## Pull Request Process
As Technical Program Manager, PRs must be:
1. **Descriptive**: Title with Conventional Commits, body with "What/Why/How," references to issues/docs.
2. **Small**: One feature/fix per PR (e.g., "Add TTL to TX queue").
3. **Tested**: Include tests (pytest/Hardhat), coverage reports.
4. **Linted**: Run `black .`, `ruff .`, `npx prettier --write .`.
5. **Reviewed**: At least 2 approvals; check for compliance (e.g., no data leaks).
6. **Merged**: Squash commits, rebase on main.

Auto-checks: GitHub Actions CI/CD (lint, test, deploy preview).

## Code Style and Standards
- **Solidity**: Follow OpenZeppelin guidelines, use NatSpec comments, gas optimization.
- **Python**: PEP 8, Black formatting, Pydantic for models, JSON logging (structlog).
- **Commits**: Conventional (feat:, fix:, docs:, chore:).
- **Comments**: # TODO for open items, with questions.
- **Security**: Zero-trust (sandbox all), error handling, input validation.

## Testing and Quality Assurance
- **Unit Tests**: Cover 80%+ (pytest for Python, Chai for Solidity).
- **Integration**: Simulate end-to-end (e.g., TX ingress → PoT → emission).
- **Audits**: Slither for Solidity, Bandit for Python; run before PR.
- **Simulations**: Use economic_simulation.md for token model tests.

As Security Engineer, include fuzz testing for bridges/PoT.

## Legal and Compliance
As FinReg Legal Advisor and Privacy & Data Counsel:
- **Licensing**: Contributions under MIT; sign CLA if needed (contact info@arosstudio.com).
- **IP**: Disclose patents; AST reserves core architecture (e.g., NodeChain, PoT).
- **Compliance**: No code enabling unregistered securities; ensure GDPR in data handling.
- **Regulatory**: Contributions must support PSD2/OpenBanking; report potential issues.

As Licensing Counsel, templates for B2G contracts available upon request.

## Community and Communication
- **Discussions**: Use GitHub Discussions for ideas, Issues for bugs.
- **Channels**: Slack/Discord for team (invite via PR), Twitter for updates (@aros_studio).
- **Meetings**: Bi-weekly governance calls (join via Governance Layer proposals).
- **Recognition**: Contributors credited in README.md and CHANGELOG.md.

As Communications Architect, frame your contributions in AST's narrative: "Building ethical financial infrastructure for cities and nations."

## Acknowledgments
Thank you for contributing to AST! Your work helps create a compliant, AI-powered tokenomics system for real-world impact. For questions, open an Issue or email info@arosstudio.com.

Adopted from Contributor Covenant v2.1.
