# Epoch Allocation Model

Allocation model defines how emission is distributed each epoch.

## Inputs

- Baseline emission curve.
- PoT performance metrics.
- Reserve coverage ratios.
- Velocity indicators.

## Algorithm

Weighted scoring adjusts base emission with positive or negative modifiers. Hard caps prevent exceeding
policy limits. Output includes allocation per vault bucket.

## Transparency

Model parameters published with change history. Simulation tools allow stakeholders to test scenarios
before adoption.
