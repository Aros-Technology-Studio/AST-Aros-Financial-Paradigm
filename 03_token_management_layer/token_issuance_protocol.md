# token_issuance_protocol.md

## Purpose

This document defines the rules, conditions, and algorithmic principles under which new ArosCoins are issued into circulation. The goal is to guarantee fairness, transparency, and utility-driven emission, aligned with AST’s decentralized architecture and transactional economy.

---

## Fee Distribution Principles

- **No Central Authority**: Tokens are not minted by a centralized party. Fee Distribution is triggered solely by on-chain activity.
- **Utility-Driven Supply**: The creation of tokens is directly tied to validated transaction processing. If the system is idle, no new tokens are minted.
- **Finite Maximum Supply**: The total number of ArosCoins is capped. No further issuance is possible once the hard cap is reached.
- **On-Demand Generation**: Tokens are created only when a transaction requires validation and decentralized encryption.

---

## Fee Distribution Trigger Conditions

Tokens are minted **only** when the following criteria are simultaneously met:

1. A transaction has been submitted to the AST processing queue.
2. The transaction has passed validation, fragmentation, and encryption phases.
3. The set of participating nodes successfully completed signature consensus.
4. The node payment calculation engine has produced an eligible emission request.

---

## Fee Distribution Calculation Logic

```mermaid
flowchart TD
    A[New Transaction Received] --> B[Validated and Fragmented]
    B --> C[Encrypted by Nodes]
    C --> D[Signature Consensus Achieved]
    D --> E[Payment Engine Calculates Fee Distribution]
    E --> F[Tokens Minted Proportionally to Workload]
```

### **Canonical Formula:**

```
Emission   = Transaction Amount        (1:1 — no multiplier)
Commission = Transaction Amount × rate (default 0.5%)
Node Share = Commission × 0.75
AFC Share  = Commission × 0.25
```

ARO tokens are minted 1:1 to the transaction amount and burned on transaction completion.
The per-node reward comes from the **Node Share** distributed by PoT weight, not from
a `node_weight` multiplier applied to the emission amount.

> Earlier documentation showed `tokens_to_mint = (transaction_fee * emission_ratio) * node_weight`.
> That formula is superseded by the canonical 1:1 model. See `src/token/emission.service.ts`.

---

## **Token Distribution at Issuance**

Commission from each transaction is split as follows (canonical values):

| **Receiver** | **Percentage** | **Destination** |
| --- | --- | --- |
| Node Pool (by PoT weight) | **75%** | `SYSTEM_NODE_POOL_00000000000000000000` |
| AFC Reserve | **25%** | `SYSTEM_AFC_RESERVE_000000000000000000` |

> **Canonical split (PR #72)**: 75% node pool → 25% AFC reserve. Earlier docs showed
> a 60/25/10/5 four-way split; that model is superseded. Governance bounties and ecosystem
> grants are funded separately from the AFC reserve via DAO votes, not from per-TX splits.
> 

---

## **Safeguards**

- **Double-Mint Protection**: Once an emission is triggered, the transaction ID is locked from further issuance.
- **Fork Safety**: All minting events are checkpointed and auditable on-chain.
- **Deposit Forfeiture Risk**: Malicious nodes attempting to inflate minting are penalized via stake slashing.

---

## **Linked Documents**

- token_distribution_model.md
- node_payment_allocation.md
- aroscoin_supply_model.md

---
