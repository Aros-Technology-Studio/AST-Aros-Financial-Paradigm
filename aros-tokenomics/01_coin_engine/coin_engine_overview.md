# Coin Engine Overview

The Coin Engine governs how ArosCoin (ARO) comes into existence, circulates, and is retired. It
fuses behavioural incentives with deterministic economic policy so that network contribution,
compliance, and liquidity are rewarded in predictable ways. The engine is designed to operate in
three tightly coupled domains:

1. **Emission Governance** – Defines how validator checkpoints, Proof of Transaction (PoT) scores,
and programmatic policy updates shape the base emission curve.
2. **Circulation Management** – Routes ARO to the right recipients through vault distribution,
staking rewards, and automated buy-backs triggered by market telemetry.
3. **Risk Controls** – Enforces guardrails such as emission caps, rate limiters, and supervisory
approvals to keep monetary policy aligned with regulatory mandates.

## Architecture

The engine is orchestrated by a deterministic state machine comprised of:

- **Policy Registry** tracking emission schedules, burn rules, and emergency overrides.
- **Event Bus** propagating PoT attestations, validator performance metrics, and liquidity signals.
- **Settlement Processor** distributing ARO across validator, treasury, ecosystem, and grant vaults.

Each component exposes a versioned API so that governance proposals can update the engine without
risking incompatible behaviour. Policy changes must be notarised by the Governance Layer and
propagated through the Bridge Layer to any dependent financial institutions.

## Operational Flow

1. **Collect Evidence**: NodeChain attestations, validator uptime, and macro liquidity indicators are
aggregated into the policy registry at the end of each epoch.
2. **Compute Emission**: The emission kernel calculates baseline minting using the scheduled curve,
then applies positive or negative adjustments based on PoT scores and reserve utilisation.
3. **Execute Distribution**: The settlement processor emits transactions against the vault ledger,
updating token balances and writing a trace into the Processing Layer audit log.
4. **Monitor Stability**: Supervisory agents watch volatility bands, enforcing burn triggers or
freezes if thresholds are breached.

## Interfaces

The Coin Engine integrates with other layers through:

- **Processing Layer** for transaction sequencing, batching, and reconciliation.
- **Governance Layer** for authorising parameter updates and emergency pauses.
- **AI Supervisory Layer** for predictive anomaly detection and policy simulations.
- **Bridge Layer** for synchronising fiat conversions and reporting to regulated partners.

## Change Management

All modifications to the Coin Engine must pass through the multi-tiered governance process. Every
parameter change is logged in the global changelog and mirrored in the threat model to ensure
risk-aware traceability. Automated regression tests verify that emission math remains deterministic
under multiple load scenarios and that policy updates are backwards compatible with historical data.
