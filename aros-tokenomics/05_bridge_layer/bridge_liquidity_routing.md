# Bridge Liquidity Routing

Liquidity routing ensures optimal settlement paths across partners.

## Inputs

- Real-time liquidity balances from pools and custodians.
- FX rates and on-chain prices.
- Compliance constraints per jurisdiction.

## Routing Algorithm

1. **Candidate Generation**: Identify viable routes across internal pools and partner networks.
2. **Scoring**: Evaluate based on cost, latency, risk, and compliance requirements.
3. **Selection**: Choose top-ranked path with failover ready.
4. **Execution**: Coordinate settlements and monitor completion.

## Risk Management

- Diversify routes to avoid concentration risk.
- Configure circuit breakers for partners experiencing distress.
- Provide manual override for supervisors during exceptional events.
