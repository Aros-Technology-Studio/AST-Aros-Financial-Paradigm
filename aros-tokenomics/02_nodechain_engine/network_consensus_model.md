# Network Consensus Model

AST utilises a Proof of Transaction (PoT) consensus mechanism prioritising validated economic
activity over stake weight. Consensus is achieved via micro-epochs coordinated by NodeChain sharding.

## Consensus Phases

1. **Selection**: The scheduler chooses shard leaders and attestors using PoT-weighted randomness.
2. **Validation**: Leaders collect transactions, verify compliance metadata, and propose blocks.
3. **Attestation**: Attestors review proposed batches, ensuring both transactional validity and
behavioural integrity metrics align with expectations.
4. **Finalisation**: Once a supermajority attests, the batch is finalised and recorded across shards.

## Weighting Factors

- **PoT Score**: Weighted by transaction volume validated, fraud detection accuracy, and audit
compliance.
- **Stake Collateral**: Serves as a secondary weight to mitigate Sybil attacks.
- **Behavioural Reputation**: AI agents supply dynamic modifiers for historical reliability.

## Slashing & Incentives

- **Soft Faults**: Minor deviations reduce rewards but do not slash stake; repeated offences escalate.
- **Hard Faults**: Double-signing, censorship, or collusion trigger full slashing and ejection.
- **Positive Reinforcement**: Validators exceeding performance targets gain bonus weighting for future
leader selection.

## Safety and Liveness

- **Asynchronous BFT**: The consensus layer tolerates partial synchrony and network partitions.
- **Fallback Committees**: Emergency committees can finalise batches if standard quorum is unavailable,
subject to supervisory review.
- **Governance Hooks**: Governance proposals can tweak weighting coefficients with time-locked
activation to prevent sudden changes.

## Monitoring

Telemetry on consensus health—latency, vote distribution, attestation variance—is collected in real
time. Alerts feed into the Extra Supervisory Layer for rapid mitigation.
