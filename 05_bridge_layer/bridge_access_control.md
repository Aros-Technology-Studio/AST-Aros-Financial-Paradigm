# bridge_access_control.md

## 1. Purpose

This document defines the **access control policies and mechanisms** that govern who, how, and under what conditions can initiate or interact with bridge operations in the Aros Studio Tokenomics system.

The goal is to enforce:
- Role-specific privileges
- Zero-trust access architecture
- Jurisdiction-aware participation rules
- Immutable audit trail on all permission changes

---

## 2. Access Roles

| Role                | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| 👤 End User          | Individual users initiating entry or exit via bridge                        |
| 🛡️ Compliance Agent | Verifies KYC/AML status and issues risk flags                               |
| 🧠 AI Authority      | Autonomous watchdog for anomaly-based freeze logic                          |
| 🧑‍⚖️ Governance Node  | Participates in proposal voting and adapter approval                        |
| 🛠️ System Maintainer | Deploys and upgrades bridge components (via multisig or time-lock)          |

Each role has limited scope and cannot escalate privileges across categories.

---
## 3. Access Control Contract

```solidity
interface IBridgeAccessControl {
    function hasRole(bytes32 role, address user) external view returns (bool);
    function grantRole(bytes32 role, address user) external;
    function revokeRole(bytes32 role, address user) external;
    function freezeBridge(address target, string memory reason) external;
}
```

Roles are defined as:

- ROLE_USER
- ROLE_COMPLIANCE
- ROLE_AI
- ROLE_GOVERNANCE
- ROLE_MAINTAINER

Role changes are time-delayed and publicly logged.

---

## **4. Zero-Trust Enforcement**

- No default roles are assigned
- All privileges must be explicitly granted
- Role escalation is disabled by default
- Every critical call checks hasRole() internally
- Users flagged by Compliance Oracle are locked out of bridge access

---

## **5. Jurisdictional Filters**

Bridge access is dynamically filtered by:

- Country of residence
- Regulatory status of user
- Sanction list match
- Economic risk scoring

```solidity
modifier jurisdictionCheck(address user) {
    require(ComplianceOracle.isAllowed(user), "Jurisdiction restricted");
    _;
}
```

---

## **6. Role Expiry & Revocation**

All temporary roles (e.g. external liquidity provider, test adapter maintainer) must have:

- Expiry timestamp
- Revocation policy
- Quorum-based override in emergencies

The All-Seeing Eye triggers automated revocation if misuse patterns are detected.

---

## **7. Emergency Freeze Logic**

Any role with emergency clearance (ROLE_AI, ROLE_GOVERNANCE) can trigger:

```solidity
function freezeBridge(address target, string memory reason) external;
```

Upon trigger:

- All pending operations are paused
- Forensic mode is enabled
- Multisig review must confirm or reject within 24h

---

## **8. Audit Logging**

Every access operation (grant, revoke, freeze, escalate) is:

- Logged on-chain
- Timestamped with UTC and block number
- Assigned a unique AuditEventID
- Included in BridgeAccessLedger for future snapshot review

---

## **9. Integration Points**

| **Component** | **Role** |
| --- | --- |
| Tokenization Bridge | Verifies ROLE_USER before mint |
| Reverse Bridge | Verifies ROLE_USER + compliance clearance before exit |
| Governance Layer | Manages ROLE_GOVERNANCE voting and adapter approval logic |
| All-Seeing Eye | Holds ROLE_AI with autonomous revocation and freeze power |
| Compliance Oracle | Issues and updates access eligibility data |

---

## **10. Principle**

> “A bridge is not public property — it is conditional privilege.”
> 

Only qualified, verified, and risk-scored participants may engage with the Aros bridge.

---
