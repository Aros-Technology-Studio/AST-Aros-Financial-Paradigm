# contract_versioning_policy.md

## Purpose

This document defines the versioning strategy and upgrade policy for all smart contracts within the AST ecosystem. It ensures maintainability, backward compatibility where required, and structured contract evolution over time.

---

## Versioning Format

AST smart contracts use **semantic versioning** format:
```
vMAJOR.MINOR.PATCH

- `MAJOR`: Incompatible logic changes (e.g., shift in tokenomics or governance logic)
- `MINOR`: Backward-compatible improvements (e.g., added view functions or optimizations)
- `PATCH`: Bug fixes or metadata updates, fully backward-compatible

---


## Contract Registry Version Enforcement

Every deployed smart contract entry in the Smart Contract Registry must include a `version` field matching this format.

If a contract is upgraded:
- Previous version is marked `deprecated`
- New version is registered with updated metadata
- Linked contracts are notified (via `UpgradeProxy` or governance event)

---

## Upgrade Workflow

| Stage         | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| `Proposal`    | Upgrade initiated via governance proposal or internal review                |
| `Audit`       | Contract is audited, signature hash is submitted to registry                |
| `Simulation`  | Deployed on testnet or sandbox with rollback simulation                     |
| `Deployment`  | New version is deployed on-chain                                            |
| `Registry`    | `contractRegistryService` is updated with new version                       |
| `Activation`  | Contract becomes active and routable (or `UpgradeProxy` points to new one)  |

---

## Upgrade Constraints

- Critical contracts (TokenCore, GovernanceEngine, BurnMechanism) require:
  - Multi-quorum validator approval
  - Signed snapshot of state migration
- Minor and patch upgrades can be processed via fast-track if:
  - No state migration is involved
  - Audit is approved by at least two validators

---

## Compatibility Guarantees

- Contracts with external API bindings must maintain backwards-compatible interfaces on MINOR and PATCH updates
- Breaking changes must be preceded by a minimum 10-block activation delay

---

## Emergency Rollback Policy

- In case of a critical vulnerability, `The All-Seeing Eye` can trigger rollback to a previously whitelisted version via `contractRollbackService`.
- Rollback event is logged on-chain and requires governance retro-approval within 100 blocks.

---

## File Location

This document belongs to the AST repository under:
```

/docs/contracts/contract_versioning_policy.md

```
---

Следующий документ: `contract_upgrade_proxy.md` — подтвердить продолжение?
```
