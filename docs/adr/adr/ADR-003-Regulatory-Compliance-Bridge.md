# ADR-003: Mandatory Regulatory Compliance Bridge
**Status:** Accepted

## Context
The AST Platform is not a permissionless, anonymous network. It is an infrastructure solution ("Swiss Watch") built to service Governmental and Financial Institutions. This audience has a non-negotiable requirement for regulatory compliance, specifically **KYC (Know Your Customer)** and **AML (Anti-Money Laundering)** checks. To achieve the goal of "merging with fiat," the platform *must* have a mechanism to enforce these rules at its border.

## Decision
We will architect the `Bridge Layer` (Module 05) as a **mandatory, zero-trust gateway** that enforces compliance for all value moving in or out of the AST ecosystem.

This decision is implemented as the `kyc_aml_interface_bridge.md` protocol:

1.  **Compliance Oracle:** The system will rely on an internal "Compliance Oracle" that communicates with external, 3rd-party KYC Providers.
2.  **Mandatory Checks:** No "Tokenization" (fiat-to-crypto) or "Reverse Tokenization" (crypto-to-fiat) operation is permitted *unless* the user's identity has been successfully verified by the Oracle.
3.  **Risk-Based Access:** The Oracle will assign a dynamic **Compliance Score** to users. This score determines their permissions, transaction limits, and access levels (e.g., "Verified," "Limited," "Suspended").
4.  **Schema Enforcement:** The `bridge_request.schema.json` formally requires a `kycDecision` and `riskScore` for requests to be considered valid.

## Consequences

**Positive:**
* **Institutional Trust:** This architecture makes the platform "legally correct" from day one. It is the single most important feature for our target audience.
* **Risk Management:** The risk-based model allows for fine-grained control, isolating potential threats without halting the entire system.
* **Provable Compliance:** We can provide regulators with a clear, auditable trail demonstrating that 100% of external value flow is screened.

**Negative / Trade-offs:**
* **Centralization of Trust:** This model is not fully decentralized. It explicitly trusts the "Compliance Oracle" and the 3rd-party KYC providers it integrates with. This is a deliberate trade-off for compliance.
* **User Friction:** Mandatory KYC creates a barrier to entry not found in typical crypto projects, slowing user onboarding.
* **Data Privacy:** This model must interface with sensitive off-chain identity data, creating a critical dependency on the privacy and security of the (off-chain) KYC provider.
