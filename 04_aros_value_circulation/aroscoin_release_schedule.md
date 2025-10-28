# aroscoin_release_schedule.md

### **📑 Содержание документа:**

```markdown
# ArosCoin Release Schedule

## 1. Purpose

This document defines the **temporal structure** for releasing ArosCoin from system-controlled sources (Vaults, Pools, Governance allocations) into circulation. It ensures that all token emissions follow **predictable**, **auditable**, and **non-speculative** logic.

---

## 2. Release Sources

ArosCoin can enter circulation through the following authorized sources:

| Source                 | Type                  | Description                                      |
|------------------------|-----------------------|--------------------------------------------------|
| ⏳ Vaults              | Time/condition-locked | Released upon maturity or event triggers         |
| 🧠 Governance Pool     | Proposal-driven        | Requires vote outcome to unlock                  |
| 💼 Operational Pool    | Validator + AI release| Periodic payout with velocity throttle           |
| 🔁 Reserve Unlock      | Emergency + long-term  | AI/gov coordinated economic release              |

Each source is **contract-bound**, with immutable scheduling logic and rate caps.

---

## 3. Release Models

ArosCoin supports multiple scheduling models per source:

| Model               | Characteristics                                                   |
|---------------------|-------------------------------------------------------------------|
| 📅 Fixed Interval    | Predefined time-based unlocks (e.g. every 30 days)                |
| 📈 Dynamic Demand    | Release volume scales with system usage or validator uptime       |
| 🧠 Governance Gated  | Requires quorum-based unlock resolution                           |
| 🧬 AI-Adjusted       | Velocity-controlled, adaptive release curve                       |
| 💤 Inactivity Decay  | Unlocks gradually if usage is minimal (prevents hoarding)         |

Each model is chosen at contract deployment and logged on-chain.

---
```

```solidity
**## 4. Sample Unlock Logic**

```solidity
function getUnlockedAmount() public view returns (uint256) {
    uint256 elapsed = block.timestamp - releaseStart;
    uint256 total = vaultAllocation;
    if (elapsed >= vestingDuration) {
        return total;
    } else {
        return (total * elapsed) / vestingDuration;
    }
}
```

Contracts use releaseStart, vestingDuration, and vestingCliff to compute eligibility.

---

## **5. Release Calendar Strategy**

The total circulating supply is divided into **epochal time windows**, each with:

- Max release ceiling
- Tier-based allocation bands
- Reserve refill checkpoints
- Reward + proposal liquidity slots

Each epoch (e.g. 30 days) is closed by the Processing Layer and recalibrated via:

- Usage stats
- Velocity metrics
- Proposal activity
- Burn/return volume

---

## **6. Cliff, Vesting & Deferral**

Token release is not front-loaded. All emissions are controlled via:

| **Control Type** | **Definition** |
| --- | --- |
| ⛔ Cliff | Tokens remain fully locked for a period |
| 🔁 Vesting | Gradual unlock in linear/increasing curve |
| ⏸ Deferral | Governance/AI-triggered pause |

This supports anti-dump behavior and smooth circulation growth.

---

## **7. Emergency Interruption**

AI or Governance may trigger pauseRelease() under high-risk conditions:

```solidity
function pauseRelease() external onlyAIOrGov {
    releasePaused = true;
}
```

Reactivation requires multi-layer consensus.

---

## **8. Integration Points**

| **Subsystem** | **Role in Release Logic** |
| --- | --- |
| Vault System | Time-locked base release source |
| Governance Layer | Unlocks triggered by proposals or events |
| Processing Layer | Epoch tracking, velocity check, recalibration |
| Buyback Engine | May counterbalance by absorbing circulating flow |
| Reserve Controller | Optional long-tail release mechanism |

---

## **9. Final Note**

> “In Aros, time is a contract — not a guess. Release means responsibility.”
> 

---