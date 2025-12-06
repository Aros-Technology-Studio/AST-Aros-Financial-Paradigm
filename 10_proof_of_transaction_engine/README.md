# Proof of Transaction Engine

## Purpose
The Proof of Transaction (PoT) Engine is the core consensus validation logic of AST. Unlike PoW or PoS, it derives validation power from active, honest, and high-integrity participation in transaction processing. It assigns weight to nodes based on their behavioral reputation and transactional contribution.

## Core Services & Components
- **Validation Logic**: Analyzes validity of transactions in NodeChain context.
- **Weighting Model**: Calculates node influence based on activity and history.
- **Node Assignment**: Determines which nodes validate specific shards.
- **Slashing Conditions**: Penalizes malicious or lazy behavior.

## Key Specifications
- [PoT Engine Overview](pot_engine_overview.md)
- [Validation Logic](pot_tx_validation_logic.md)
- [Weighting Model](pot_tx_weighting_model.md)
- [Slashing Conditions](pot_slashing_conditions.md)

## Responsible Team
- PoT Engine Team
