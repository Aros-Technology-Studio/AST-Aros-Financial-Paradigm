# epoch_allocation_model.md

## Module: Epoch Allocation Model
- **Layer**: Emission Layer — AST (Aros Studio Tokenomics)
- **Status**: Production-grade
- **Author**: Aros Studio Blockchain Division
- **Last Updated**: 2025-07-05

---

## Overview

This module defines the rules, boundaries, and mechanics by which ArosCoin (AROS) emission is distributed across time-based or event-based epochs. The goal is to enforce a predictable, governance-controlled, and shard-aware token allocation model that balances reward, deflation, and operational sustainability.

Epochs serve as **bounded time or event windows**, each with a defined **maximum emission capacity**, **distribution logic**, and **auditable state hash**.

---

## Epoch Structure

| Field              | Description |
|--------------------|-------------|
| `epoch_id`         | Unique identifier for the epoch |
| `start_timestamp`  | Beginning of epoch (UTC) |
| `end_timestamp`    | End of epoch (UTC) |
| `max_emission_cap` | Maximum AROS that may be emitted during this epoch |
| `shard_distribution_map` | Emission quotas per shard/domain |
| `policy_version`   | Governance policy version applied to this epoch |

---

## Allocation Rules

### 1. Global Emission Cap

Each epoch defines a strict upper bound of tokens that may be emitted across the network. No bypass or overflow is permitted unless explicitly voted on via governance.

### 2. Shard-Level Quotas

Each shard (e.g., geographic, regulatory, or functional) is assigned a quota proportional to its validator activity, transaction volume, and risk-adjusted weight.

Example:

```json
{
  "epoch_id": 196,
  "shard_distribution_map": {
    "SH-EU-01": 250000,
    "SH-US-02": 180000,
    "SH-APAC-03": 120000
  }
}
```

### **3. Allocation Slices**

The emitted volume is subdivided by role:

| **Role** | **Allocation %** |
| --- | --- |
| Validator reward | 60% |
| Governance pool | 25% |
| Ecosystem reserve | 10% |
| Risk buffer | 5% |

These ratios may evolve under governance consensus.

---

## **Epoch Transition Conditions**

Epochs may end under:

- Time expiration (e.g., 7 days)
- Emission exhaustion (100% of max cap used)
- Governance override (emergency stop or restart)
- Fork-resolution checkpoint (new epoch forces sync)

New epochs inherit or override previous policy state.

---

## **Snapshot & Audit**

Each epoch emits a finalized hash snapshot including:

- Total tokens emitted
- TX IDs that triggered emission
- Validators involved
- Shard quotas used
- Remaining unspent quota
- Risk buffer deployment (if any)

This data is stored via emission_reporting_and_traceability.md.

---

## **Mermaid Diagram**
```
flowchart TD
    A[New Epoch Starts] --> B[Track Emission Triggers]
    B --> C [Check Quotas per Shard]
    C --> D [Distribute Tokens by Role]
    D --> E [Update Emission Counters]
    E --> F {Cap Reached or Time Expired?}
    F -- Yes --> G [End Epoch & Freeze Snapshot]
    F -- No --> B

```

---

## **Dependencies**

- emission_flow_pipeline.md
- tx_journal_writer.md
- nodechain_hash_map_index.md
- governance_layer.md

---

## **Next**

→ See [emission_fraud_prevention.md](https://www.notion.so/aros-studio/emission_fraud_prevention.md) for rules that prevent manipulation of emission triggers.

```

```
