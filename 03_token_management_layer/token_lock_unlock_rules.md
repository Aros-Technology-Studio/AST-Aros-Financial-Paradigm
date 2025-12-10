# token_lock_unlock_rules.md

## Purpose

This document outlines the rules, timeframes, and conditions under which ArosCoin (ARO) tokens may be **locked**, **unlocked**, or **relocked** across different stakeholder categories. It is a critical part of the token governance and compliance layer, ensuring fairness, predictability, and economic stability within the AST (Aros Studio Tokenomics) system.

---

## Structure

### 1. Token Lock Categories

- **Founders & Core Team**
  - Lock Duration: 24 months
  - Vesting: Linear monthly unlock after 12-month cliff
  - Restrictions: Cannot participate in token swaps before 18 months

- **Advisors**
  - Lock Duration: 18 months
  - Vesting: Linear unlock from month 6

- **Private Round Investors**
  - Lock Duration: 12 months
  - Vesting: Linear unlock from month 3

- **Public Sale Participants**
  - Lock Duration: 3 months
  - Vesting: Full unlock at month 4

- **Ecosystem Grants & Payments**
  - Lock Duration: Variable (6–36 months)
  - Controlled by smart contract schedules

---

### 2. Unlock Mechanism

- All locks are enforced on-chain via smart contracts.
- Unlocking is triggered by:
  - Predefined timestamp schedules
  - Fulfillment of specific milestones (optional)
  - Multi-signature oracles for exception cases

---

### 3. Relocking Conditions

- Voluntary relocking is available for:
  - DAO staking payments
  - Governance privileges
- Relocking duration: min 6 months, max 36 months
- Relocked tokens generate increased voting weight (1.5x per 12-month cycle)

---

### 4. Emergency Lock Protocol (ELP)

- AST Governance Board can initiate a system-wide temporary lock
- Conditions:
  - Severe market manipulation detected
  - Oracle compromise or attack on smart contract infrastructure
- Duration: up to 72 hours (renewable by governance vote)

---

### 5. Lock Violation Penalties

- Early unlock attempts are rejected on-chain
- Malicious manipulation attempts result in:
  - Token burn of 5–20%
  - Blacklisting from future distributions or governance

---

### 6. Transparency & Audit

- Public dashboard will display:
  - All current locked wallets
  - Unlock schedules
  - Historical unlock activity
- External audits every 6 months

---

## File Location

This file belongs to the AST repository under:
/docs/tokenomics/token_lock_unlock_rules.md
```
