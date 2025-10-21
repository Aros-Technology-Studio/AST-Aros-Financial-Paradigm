# Coin Volatility Controls

The AST monetary stack implements layered volatility controls to keep ArosCoin stable enough for
enterprise usage while preserving market-driven discovery. Controls are implemented at protocol and
governance layers to mitigate both endogenous and exogenous shocks.

## Protocol-Level Controls

- **Dynamic Fee Bands**: Transaction fees scale with network utilisation. Higher fees slow excessive
speculation, whereas low-load periods reduce costs to encourage throughput.
- **Reserve Rebalancing**: Liquidity pools managed by the Value Circulation layer rebalance ARO against
fiat and major cryptocurrencies using target corridor models. Deviations exceeding 5% trigger
automated arbitrage orders financed from the reserve pool.
- **Emission Dampeners**: The emission model includes dampening coefficients tied to price deviation.
If 7-day volatility surpasses 12%, new emission is tapered until variance normalises.
- **Auto-Burn Hooks**: When vault utilisation falls below governance-defined floor values, a portion of
transaction fees are automatically burned to reduce circulating supply.

## Governance-Level Controls

- **Circuit Breakers**: The Governance Layer can institute temporary trading halts on compliant bridge
endpoints if abnormal order flow or supervisory alerts indicate manipulation.
- **Collateral Requirements**: Institutions seeking leveraged exposure through the bridge must post a
volatility buffer in ARO and stable assets, reducing systemic contagion risk.
- **Policy Backtesting**: Every quarter, the Monetary Policy Council runs scenario-based stress tests to
validate that controls remain effective under worst-case assumptions.

## Supervisory Oversight

The Extra Supervisory Layer aggregates metrics from oracle feeds, AI anomaly models, and audit logs.
If composite risk scores breach the amber threshold, the council receives a structured alert with
recommendations such as reserve injections, temporary fee increases, or targeted buy-backs.

## Transparency & Reporting

All interventions are timestamped, signed, and archived in the processing audit ledger. Public
reports summarise volatility events, actions taken, and restoration outcomes. This transparency
maintains stakeholder trust and provides data for future policy optimisations.
