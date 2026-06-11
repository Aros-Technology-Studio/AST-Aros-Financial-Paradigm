### burn_mechanism.md

## I. Purpose

This document defines the rules, logic, and protocol triggers for the token burn mechanism in AST. The mechanism ensures deflationary pressure, dynamic balance, and structural alignment with AST’s emission model.

## II. Scope

The burn logic is embedded directly in the transaction processing layer of AST. It affects ARO tokens used in successful transaction cycles and interacts with the token_generation_contract.md.

⸻

## III. Burn Logic Overview

**1. Canonical Post-Transaction Burn (Primary)**
- After every transaction cycle, the full emitted amount of ARO is burned.
- Emission follows a 1:1 model: `emissionAmount = transactionAmount`
- Commission is calculated separately: `commission = transactionAmount × commissionRate (default 0.5%)`
- Commission split: **75% → node pool**, **25% → AFC reserve** (no burn from commission)
- The emitted ARO (= transactionAmount) is fully burned after transaction completion.
- This makes ARO supply **transient** — net circulating supply change per TX cycle = 0.
- Example:
```
transactionAmount = 10,000 ARO emitted and burned
commission        = 10,000 × 0.5% = 50 ARO
  → nodeShare     = 50 × 75% = 37.50 ARO → node pool
  → afcShare      = 50 × 25% = 12.50 ARO → AFC reserve
```
- Canonical implementation: `EmissionService.processTransactionEmission()` in `src/token/emission.service.ts`

**2. NodeChain Incentive Alignment**
- Nodes benefit from the accumulated AFC reserve driving the emission price index upward.
- AFC Reserve Index: `1.0 + sqrt(totalReserve) / 10_000` — grows sub-linearly with reserve size.
- A feedback loop is established:
  - Reserve grows → emission price rises → higher ARO value per unit → greater validator incentive per unit

**3. Overflow Burn (Emergency Throttle)**
- If total circulation exceeds predefined threshold, additional burn rate is applied per epoch.
- Triggered by:
  - `total_supply > target_ceiling`
  - `velocity_of_token < minimum_velocity_threshold`

**4. Dead Wallet Strategy**
- Burned tokens are sent to a verifiable unspendable address: `SYSTEM_BURN_VAULT_00000000000000000000`
- All burn operations are tagged `POST_TX_CANONICAL_BURN` in transaction metadata.
- This address is monitored by an independent audit service (burn_audit_agent).

⸻

## IV. Parameters and Constants

| Parameter                  | Description                                      | Value            |
|----------------------------|--------------------------------------------------|------------------|
| emission_ratio             | ARO minted per unit of transaction amount        | 1:1              |
| commission_rate            | Commission as fraction of transaction amount     | 0.5% (default)   |
| node_share_ratio           | Fraction of commission to node pool              | 75%              |
| afc_reserve_ratio          | Fraction of commission to AFC reserve            | 25%              |
| post_tx_burn               | Full emissionAmount burned after TX completion   | 100% of emission |
| target_ceiling             | Max total supply before overflow logic           | 1,000,000,000 ARO|
| overflow_burn_rate         | Additional rate during overflow epochs           | 10%              |
| minimum_velocity_threshold | Velocity below which overflow triggers           | 0.7              |

```

⸻

## V. Execution Flow

```
flowchart TD
    A[Transaction Amount] --> B[Mint emissionAmount 1:1]
    B --> C[Calculate commission = txAmount × rate]
    C --> D[75% → Node Pool]
    C --> E[25% → AFC Reserve]
    E --> F[Update AFC Reserve Index]
    B --> G[Burn emissionAmount POST_TX_CANONICAL_BURN]
    A --> H[Trigger Overflow Check]
    H -->|Yes| I[Apply Extra Burn Rate per Epoch]
    H -->|No| J[Continue Standard Flow]
```

⸻

## VI. Monitoring and Audit
•burn_audit_agent service publishes regular burn stats to the AST public dashboard.
•Token explorers will tag burn transactions for full transparency.
•Any anomaly in burn volume per epoch triggers an emission_safety_flag.

