# aroscoin_entry_exit_rules.md

## 1. Purpose

This document defines the conditions and constraints under which ArosCoin may **enter or exit** the internal ecosystem of AST. Unlike conventional tokens, ArosCoin is **not globally transferrable or permissionless**. Its movement across system boundaries is strictly governed by protocol rules.

---

## 2. Definitions

- **Entry**: The process of converting external fiat or crypto value into ArosCoin, placing it inside the AST system.
- **Exit**: The reverse process — converting held ArosCoin into fiat or external crypto, removing it from circulation.

Both directions are enforced via bridges or exchange modules that are smart-contract-governed and AI-audited.

---

## 3. Entry Points

### Authorized Entry Methods:

| Method                  | Description                                                   |
|-------------------------|---------------------------------------------------------------|
| 🔁 Tokenization Bridge   | Converts fiat or external crypto into ArosCoin                |
| 📥 Validator Incentives | Auto-minted payments upon validator performance validation     |
| 🧾 Proposal Deposits     | Entry via governance-based value locking                      |
| 🔒 Migration Contracts   | Controlled swaps from legacy systems or upgrade mechanisms    |

Every entry is **logged, rate-limited, and verifiable**.

---

## 4. Exit Points

### Authorized Exit Methods:

| Method                  | Description                                                      |
|-------------------------|------------------------------------------------------------------|
| 🔄 Reverse Bridge        | Converts ArosCoin into fiat or wrapped crypto                   |
| 🔥 Voluntary Burn        | Users initiate burn to reduce exposure or exit system            |
| 💼 Liquidity Buyout      | Protocol buys back ArosCoin at programmatic price floor         |
| 🧠 Governance Unlock     | ArosCoin is converted into real-world utility via smart channel |

Exit cannot occur spontaneously — all flows must go through **ExitGuard** contract with conditions.

---

## 5. Contractual Enforcement

```solidity
interface IExitGuard {
    function requestExit(address user, uint256 amount) external returns (bool);
    function validateConditions(address user) external view returns (bool);
    function executeExit(address user) external;
}
```

Every exit is:

- Delayed by minimum exit window (e.g. 24h)
- Audited by AI process (“The All-Seeing Eye”)
- Logged on the exit_flow_audit_log

---

## **6. Exit Risk Rules**

| **Risk Type** | **Mitigation** |
| --- | --- |
| Mass Dumping | Throttle limits + rolling exit cap |
| Price Collapse | Buyback Floor Logic + temporary mint freeze |
| Governance Attack | Quorum vault freeze + AI circuit breaker |
| Sanction Violation | KYC-enforced withdrawal rules + regulatory oracle filters |

The system favors **long-term retention** and discourages rapid in/out behavior.

---

## **7. Entry/Exit Integration Points**

- Tokenization Pipeline — defines how fiat/crypto becomes ArosCoin
- Reverse Tokenization — defines how ArosCoin becomes external value
- Buyback Engine — part of Exit
- Vaults — receive entries from bridges
- Processing Layer — supervises rate-limiting, audit, and anomaly detection

---

## **8. Design Philosophy**

> “ArosCoin is not an asset you ‘trade’ — it is a privilege you are granted access to, based on alignment with the system’s values.”
> 

Entry and exit are permissions, not entitlements.

---

## **9. Next Steps**

With entry/exit defined, we proceed to pooled liquidity management and circulation strategy:

- liquidity_pool_mechanism.md
- reserve_pool_policy.md
