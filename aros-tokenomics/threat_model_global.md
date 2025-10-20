# Global Threat Model

The AST ecosystem operates under strict regulatory and security obligations. This threat model consolidates risks across layers
and defines mitigation strategies.

## Threat Categories
- **Economic Manipulation**: Attempts to exploit emission rules, liquidity pools, or staking rewards.
- **Validator Compromise**: Unauthorized access to validator nodes, key leakage, and collusion attacks against PoT consensus.
- **Bridge Exploits**: Fraudulent KYC bypass, cross-chain replay, or oracle tampering impacting fiat/crypto settlements.
- **AI Subversion**: Poisoning of training data, adversarial inputs, or forced downtime of supervisory agents.
- **Governance Abuse**: Rogue proposals, quorum manipulation, or escalation path denial-of-service.

## Mitigation Overview
- Multi-factor validator authentication, HSM-backed signing, and behaviour scoring monitored by AI agents.
- Real-time liquidity monitoring with automated circuit breakers on compliance bridges.
- Continuous audit logging via the decentralized transaction encoding layer to support forensic investigations.
- Segregated AI training pipelines with differential privacy and mandatory human oversight for high-impact decisions.
- Governance guardrails enforcing proposal vetting, stake-weighted verification, and emergency rollback protocols.
