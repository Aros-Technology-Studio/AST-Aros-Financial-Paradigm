# token_distribution_model.md

## Purpose

This document outlines the distribution logic of newly minted ArosCoins and the token flow between various internal pools and participants of the AST ecosystem. It ensures balanced incentivization, sustainable reserves, and transparent governance over allocation policies.

---

## Distribution Pools

Upon issuance, commission fees from each transaction are distributed using the canonical 75/25 split:

| Pool Name           | Purpose                                                              | Canonical Share |
|---------------------|----------------------------------------------------------------------|-----------------|
| **Node Pool**       | Compensation for processing nodes, split by PoT-normalized weight   | **75%**         |
| **AFC Reserve**     | Accumulates to drive emission price index; funds ecosystem grants    | **25%**         |

> These ratios reflect the canonical model. Governance bounties, emergency buffers, and ecosystem grants are funded from the AFC reserve via governance vote — they are not separate per-TX commission slices.

---

## Flow of Funds

```mermaid
graph TD
    Mint[New Tokens Minted] --> Burn[Burn Vault — POST TX]
    Commission[Commission = TX × 0.5%] --> Nodes[Node Pool 75%]
    Commission --> AFC[AFC Reserve 25%]
    Nodes --> V1[Validator 1 — PoT weight]
    Nodes --> V2[Validator 2 — PoT weight]
    Nodes --> VN[Validator N — PoT weight]
```

---

## **Processing Nodes**

- **Direct payouts** occur to addresses that participated in the processing of the originating transaction.
- **Payment split** is calculated using the Proof-of-Transaction (PoT) formula, weighting the node's contribution to the specific transaction batch.
- Payments are claimable after passing audit verification to prevent double-claiming.

---

## **Ecosystem Reserve**

- Managed by AST core contributors or All-Seeing Eye governance module.
- Use cases include:
  - Developer grants and bounties
  - Strategic partnerships
  - Marketing and ecosystem expansion
  - Onboarding of validator infrastructure

---

## **Governance Pool**

- Controlled by the All-Seeing Eye governance framework.
- May be used for:
  - Upgrading protocol-level logic
  - Funding audits, legal infrastructure
  - Security Deposit-based community voting incentives

---

## **Emergency Buffer**

- Locked in a multisig vault.
- Released only during:
  - Major system bugs
  - On-chain liquidity crises
  - Severe market attacks or manipulations
- Requires multi-party approval from governance AI and selected human validators.

---

## **Auditability**

All distributions are:

- Fully recorded on-chain.
- Auditable by independent mechanisms.
- Enforced by smart contract checkpoints at the time of minting.

---

## **Linked Documents**

- token_issuance_protocol.md
- token_issuance_protocol.md
- node_payment_allocation.md
- aroscoin_supply_model.md

🔔 Подтверди, чтобы я создал следующий документ: `aroscoin_supply_model.md`.
