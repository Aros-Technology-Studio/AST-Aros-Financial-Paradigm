# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-06-02  

## 1. Purpose

Distributes incentives (commission fees) to validating nodes post-PoT confirmation in NodeChain,
following the canonical 75/25 split defined in `01_coin_engine/payment_distribution.md`.

## 2. Principles

- **Merit-Based**: Each node's share of the 75% node pool is proportional to its PoT weight.
- **Reserve-Building**: 25% of all fees flow to the AFC reserve, driving the emission price index upward.
- **Net-Zero Emission**: Emitted ARO are burned after each TX cycle; incentives are sourced from commission, not new supply.

## 3. Canonical Distribution Logic

```
Commission  = Transaction Amount × rate   (default 0.5%)
Node Pool   = Commission × 0.75           (75% → split among nodes by PoT weight)
AFC Reserve = Commission × 0.25           (25% → SYSTEM_AFC_RESERVE_000000000000000000)
```

Per-node reward from the node pool:

```
node_incentive = nodePool × (potScore(node) / Σ potScore(all_nodes))
```

PoT weight normalization ensures `Σ node_weight = 1.0`.

### Epoch-Level Distribution

At epoch finalization, `FeeDistributionService.distributeRewards()` applies the same 75/25 split
to aggregate epoch fees and distributes the 75% node pool by PoT-normalized weights.

## 4. Formula

```
nodePool    = totalFees × 0.75
afcReserve  = totalFees × 0.25

node_incentive_i = nodePool × weight_i
weight_i         = potScore_i / Σ potScore_j
potScore_i       = α·txCount_i + β·totalFees_i − δ·penaltyScore_i
```

## 5. Reference Implementation (TypeScript)

```typescript
// FeeDistributionService.distributeRewards() — src/fee_distribution/fee_distribution.service.ts
const nodePool   = totalFees * 0.75;
const afcReserve = totalFees * 0.25;

for (const [nodeId, weight] of weights.entries()) {
    const rewardAmount = nodePool * weight;
    // record VALIDATOR_REWARD ledger entry for nodeId
}
// record FEE_DISTRIBUTION ledger entry for AFC_RESERVE_ADDRESS (afcReserve)
```

## 6. Dependencies

- `01_coin_engine/payment_distribution.md` — canonical 75/25 fee split definition.
- `src/token/emission.service.ts` — per-TX canonical emission lifecycle.
- `src/fee_distribution/fee_distribution.service.ts` — epoch-level distribution.

## 7. Notes

- Epoch-End: Distribute at epoch close in NodeChain via `FeeDistributionService.triggerEpochCycle()`.
- Audit: All distribution events are recorded on the ledger and fed to The All-Seeing Eye.
- **Deprecated split** (60% validators / 30% attesters / 10% burn) was superseded by the canonical
  75/25 model (PR #72). The burn is now handled per-TX inside `EmissionService` — emitted ARO
  are destroyed after every canonical TX cycle via `burnAmount = emissionAmount − commission`,
  not from the commission pool.
