# smart_contract_registry.md

## Purpose

This document defines the design and structure of the **Smart Contract Registry** used by AST to track, verify, and manage all deployed smart contracts related to the Aros Blockchain and Tokenomics infrastructure.

---

## Goals

- Ensure a single source of truth for all active smart contracts
- Enable version control and upgrades of contracts
- Provide a transparent, auditable structure for contract dependencies
- Enable query and signature validation for critical contracts

---

## Core Structure

Each contract in the registry includes the following metadata:

```json
{
  "contract_id": "string",
  "name": "string",
  "version": "vX.Y.Z",
  "address": "on-chain address",
  "hash": "keccak256 hash of code",
  "deployed_by": "public key or ID",
  "linked_modules": ["module_a", "module_b"],
  "audit_status": "verified | pending | rejected",
  "last_updated": "ISO 8601 timestamp"
}
```

---

## **Smart Contract Types**

| **Contract Type** | **Description** |
| --- | --- |
| TokenCore | Main contract managing mint/burn/transfer of ARO tokens |
| NodeRegistry | Handles validator/staker roles and identities |
| GovernanceEngine | Logic for proposals, votes, consensus upgrades |
| BurnMechanism | Decentralized burn logic |
| Vaults | Secure holding contracts for treasury & rewards |
| SwapGate | Optional layer for token swaps |
| UpgradeProxy | Enables safe upgrade paths via proxy patterns |

---

## **API Access Layer**

All contracts in the registry are queryable via the contractRegistryService API.

Endpoints include:

- GET /contracts — List all registered contracts
- GET /contract/{id} — Get contract by ID
- POST /contract — Register new contract (admin only)
- PATCH /contract/{id} — Update metadata
- POST /contract/verify — Submit audit hash and status

---

## **Governance & Access Control**

- All registration and updates are gated by:
    - Governance approval (L2 proposal)
    - Signature validation via internal validator quorum
- Emergency override available to The All-Seeing Eye for revocation

---

## **File Location**

This document belongs to the AST repository under:

```
/docs/contracts/smart_contract_registry.md
```

---
