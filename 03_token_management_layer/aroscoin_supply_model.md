# aroscoin_supply_model.md

## 🎯 Purpose

This document defines the monetary policy and total supply logic of ArosCoin, establishing the fixed rules for issuance, circulation, and long-term scarcity dynamics. It ensures economic predictability and trust in the token's behavior across all participants.

---

## 1. Total Supply Cap

- **Maximum supply:** 1,000,000,000 ARO (hard cap).
- No additional coins can ever be minted beyond this limit.

---

## 2. Emission Schedule

### 2.1 Initial Allocation

| Category           | Allocation       | Lock/Unlock Policy               |
|--------------------|------------------|----------------------------------|
| Genesis Reserve    | 15% (150M)        | Locked 2 years, linear release   |
| Development Fund   | 10% (100M)        | 4-year vesting                   |
| Treasury & Grants  | 10% (100M)        | Available on governance trigger |
| Node Incentives    | 35% (350M)        | Emission-based, dynamic          |
| Public Circulation | 30% (300M)        | Gradual release via operations   |

### 2.2 Block Emission Rules

- No PoW mining: emission is tied to **transaction throughput** and **validated participation**.
- Each transaction pays a small fee → split among validator nodes.
- Validator nodes earn ARO from the Node Incentives Pool until exhausted.

---

## 3. Burn & Deflation Logic

- A fixed **0.5% of every transaction fee** is permanently burned.
- Additional burns triggered via governance events or fraud retribution.

---

## 4. Supply Visibility

- Real-time dashboard shows:
  - Current total supply
  - Circulating supply
  - Burned tokens
  - Validator payments remaining

- Audited monthly and published to all stakeholders.

---

## 5. Economic Safeguards

- Emission throttle mechanism if transaction volume spikes unexpectedly.
- Circuit breaker in place if validator pool exceeds emission curve.

---

## ✅ Checklist Before Launch

- [ ] Genesis mint executed and locked
- [ ] Vesting contracts deployed and verified
- [ ] Burn engine functional
- [ ] Supply dashboard live and syncing
```

---
