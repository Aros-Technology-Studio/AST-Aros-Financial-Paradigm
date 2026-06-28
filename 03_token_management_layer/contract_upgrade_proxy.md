# contract_upgrade_proxy.md

## Purpose

This document outlines the structure and operational logic of the **Contract Upgrade Proxy** used in AST to allow seamless, controlled upgrades of smart contracts without breaking external interfaces or user states.

---

## Proxy Pattern Overview

AST employs a **Transparent Proxy Pattern** to support upgradeable smart contracts. This ensures that:

- Business logic can be updated independently of data
- Proxy always points to the latest valid implementation
- External interfaces remain unchanged between upgrades

---

## Key Components

| Component             | Role                                                                 |
|-----------------------|----------------------------------------------------------------------|
| `ProxyAdmin`          | Manages upgrade authorization and storage slot management            |
| `UpgradeProxy`        | The persistent contract address users interact with                  |
| `Implementation`      | Logic contract that can be replaced without changing Proxy address   |
| `All-Seeing Eye`      | Oversees upgrades for compliance, security, and rollback ability     |

---

## Upgrade Process

1. **Proposal Submitted**
   Upgrade proposal submitted by governance or internal developers.

2. **Audit & Simulation**
   Implementation is tested in sandbox and audited by validators.

3. **Authorization**
   If approved by governance, `ProxyAdmin` is granted rights to update logic.

4. **Execution**
   `ProxyAdmin` updates the implementation address in the `UpgradeProxy`.

5. **Verification**
   `All-Seeing Eye` confirms linkage and activates version metadata.

---

## Upgrade Safety Measures

- State storage remains in `UpgradeProxy`, not the implementation contract.
- Constructor logic is disabled in implementation to prevent initialization attacks.
- Only registered upgrades are allowed via a controlled allowlist.
- Upgrade events are logged on-chain and monitored by external observers.

---

## Reentrancy Protection

The proxy logic includes reentrancy guards, ensuring that:

- No upgrade can occur during contract execution
- Upgrade actions are delayed by at least 2 blocks after proposal acceptance

---

## Emergency Recovery

If an implementation fails or breaks compatibility:

- Previous stable version can be re-pointed by `ProxyAdmin` using governance key
- `All-Seeing Eye` logs the rollback and alerts AST observers
- A patch version is queued for immediate audit and re-deployment

---

## File Location

This document belongs to the AST repository under:
```

/docs/contracts/contract_upgrade_proxy.md
