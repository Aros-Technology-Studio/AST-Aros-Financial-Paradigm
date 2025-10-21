# Node Registration and Authentication

Node registration enforces that only verified entities participate in PoT consensus. Authentication
extends across onboarding, ongoing health checks, and revocation protocols.

## Registration Workflow

1. **Pre-Screening**: Candidate operators submit corporate identity, beneficial ownership details, and
technical capability assessments. Data is processed through the compliance bridge and stored in the
Validator Registry.
2. **Stake Commitment**: Operators lock the minimum staking requirement plus a compliance bond. Funds
remain in escrow until onboarding checks complete.
3. **AI Risk Assessment**: Supervisory agents analyse historical behaviour, network telemetry, and
external sanctions lists, producing a risk score.
4. **Governance Approval**: If thresholds are met, governance delegates sign a registration proposal
which activates validator slots in the registry.

## Authentication Mechanisms

- **Hardware Security Modules**: Validator keys must reside in certified HSMs with remote attestation
support.
- **Rotating Session Keys**: Short-lived session keys are issued per epoch, limiting blast radius if
compromised.
- **Mutual TLS**: NodeChain communication requires mutual TLS anchored to compliance-approved
certificate authorities.
- **Behavioural Signatures**: AI agents maintain behavioural fingerprints, flagging deviations for
manual review.

## Revocation & Suspension

- **Automatic Slashing**: Severe protocol violations trigger immediate suspension and collateral
slashing.
- **Grace Period**: Minor issues initiate a grace window where validators can remediate within 48 hours
before being rotated out.
- **Appeals**: Operators may appeal suspensions via governance proposals. Decisions are logged with
supporting evidence for audit.

## Audit Trail

Every registration event stores a tamper-evident record within the Processing Layer’s audit log and is
referenced by the governance changelog. Compliance teams can reconstruct validator history to validate
that only authorised entities processed transactions.
