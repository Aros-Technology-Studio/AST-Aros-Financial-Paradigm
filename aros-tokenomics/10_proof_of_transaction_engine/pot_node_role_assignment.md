# PoT Node Role Assignment

Role assignment selects validators for leader and attestor duties per epoch.

## Inputs

- Current PoT scores.
- Stake collateral levels.
- Geographic and compliance diversity requirements.

## Process

Randomness beacons produce unbiased selection seeds. Scheduler assigns roles ensuring fairness and
limit on consecutive leadership to mitigate collusion.
