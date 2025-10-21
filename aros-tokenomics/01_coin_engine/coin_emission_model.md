# Coin Emission Model

The ArosCoin emission model is designed to correlate network-wide productivity with monetary supply
while maintaining predictable macro totals. Emission is calculated each epoch using the following
inputs:

- **Base Curve**: A declining exponential target that caps annual inflation at 4% during the first
three years before tapering to 2% once the circulating supply exceeds 60% of the total authorised
cap.
- **Activity Multipliers**: Proof of Transaction (PoT) scores, validator uptime, and transaction
finality latency produce positive or negative adjustments up to ±35% of the base emission for the
epoch.
- **Supervisory Overrides**: The Extra Supervisory Layer can freeze or reduce emission when systemic
risk indicators, such as liquidity stress or fraud detection, cross predefined thresholds.

## Formula

For epoch *n*, emission is computed as:

```
E_n = min(Base(n) × (1 + α × PoT_n + β × Uptime_n − γ × Latency_n), Cap_n)
```

Where:

- `Base(n)` is the scheduled emission target for the epoch.
- `PoT_n`, `Uptime_n`, and `Latency_n` are normalised scores in the range [−1, 1].
- `α`, `β`, and `γ` are policy coefficients approved through governance ballots.
- `Cap_n` is the maximum allowable mint volume set by regulatory commitments for the period.

## Feedback Loops

- **Reserve Utilisation**: If liquidity reserves drop below 30% coverage, emission is throttled by an
additional dampening factor `δ` until reserves recover above 45%.
- **Demand Signals**: A velocity indicator tracks how quickly ARO rotates across vault categories.
High velocity enables a controlled increase (max +10%) to support ecosystem growth.
- **Inflation Guardrail**: The Supervisory agents project annualised inflation. If the rolling
12-month rate exceeds 4.5%, the emission model enforces a hard contraction by reducing `Base(n)` by
up to 20% for the next four epochs.

## Transparency

Every epoch’s emission data is published to the Processing Layer audit log and summarised in the
Changelog. This includes the raw inputs, calculated coefficients, and supervisory decisions. External
stakeholders can reconstruct the emission curve by replaying the deterministic event stream stored in
the NodeChain ledger.
