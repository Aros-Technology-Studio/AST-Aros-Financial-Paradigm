# Economic Simulation

This document describes the quantitative models used to simulate supply, inflation, and liquidity dynamics for the ARO token.

## Objectives
- Validate that Proof of Transaction rewards remain sustainable under varying transaction volumes.
- Forecast liquidity requirements for compliance bridges and internal vaults.
- Stress test slashing and staking incentives against validator churn scenarios.

## Modelling Approach
- Monte Carlo simulations executed with Python (NumPy, Pandas) for emission and burn rate distributions.
- Agent-based modelling of validator behaviours, including malicious actors detected by AI agents.
- Scenario analysis for macroeconomic indicators influencing fiat-to-ARO conversion rates.

## Key Metrics
- Emission per epoch versus transaction-weighted demand.
- Vault reserve coverage ratios across retail, enterprise, and public sector cohorts.
- Governance treasury inflows and outflows for funding audits and AI retraining.

Refer to the Python notebooks in the `/simulations` directory (to be added) for executable examples.
