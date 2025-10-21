# Economic Simulation

Describes quantitative models used to simulate supply, inflation, and liquidity dynamics for ArosCoin.

## Objectives
- Validate that Proof of Transaction rewards remain sustainable under varying transaction volumes and
validator participation.
- Forecast liquidity requirements for compliance bridges, vaults, and reserve pools.
- Stress test slashing and staking incentives against validator churn and market shocks.
- Evaluate policy adjustments before implementation to minimise unintended consequences.

## Modelling Approach
- **Monte Carlo** simulations using Python (NumPy, Pandas) for emission and burn distributions.
- **Agent-Based Models** representing validators, bridge operators, and liquidity providers with
behavioural rules.
- **Scenario Analysis** incorporating macroeconomic indicators, FX volatility, and regulatory events.
- **Sensitivity Analysis** exploring coefficient changes (e.g., emission dampeners, reward weights).

## Key Metrics
- Emission per epoch versus transaction-weighted demand and inflation targets.
- Vault reserve coverage ratios across retail, enterprise, and public sector cohorts.
- Governance treasury inflows/outflows for funding audits, AI retraining, and buy-back programmes.
- Velocity measures indicating health of internal value circulation.

## Tooling
Notebooks (see forthcoming `/simulations` directory) provide reproducible experiments with sample data
sets. Results should be exported into governance proposals and referenced in changelog entries when
policies change.
