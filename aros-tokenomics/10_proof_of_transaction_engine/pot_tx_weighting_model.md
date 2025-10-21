# PoT Transaction Weighting Model

Weighting model determines how much credit each validated transaction contributes.

## Factors

- Transaction complexity and economic value.
- Compliance score for associated account.
- Latency between submission and finalisation.
- Validator role (leader vs attestor).

## Formula

Weights computed via configurable coefficients approved through governance. Model calibration occurs
monthly using simulation results and historical performance data.
