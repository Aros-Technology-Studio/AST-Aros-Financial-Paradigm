# PoT Transaction Incentive Distribution

**Module:** AST PoT Engine  
**Status:** Canonical  
**Date:** 2026-05-31  

## 1. Purpose
Distributes incentives (fees/emission) to validating nodes post-PoT confirmation in NodeChain,
following the canonical 75/25 split defined in `01_coin_engine/payment_distribution.md`.

## 2. Principles
- Merit-Based: Proportional to PoT weight in NodeChain.
- Net-Zero Supply: Every emitted ARO is burned after the transaction completes.
- Reserve-Backed: 25% of all commission accumulates in the AFC reserve, driving the emission price index upward.

## 3. Canonical Distribution Logic

```
Commission   = Transaction Amount × rate  (default 0.5%)
Node Pool    = Commission × 0.75          (75% → distributed by PoT weight)
AFC Reserve  = Commission × 0.25          (25% → SYSTEM_AFC_RESERVE_000000000000000000)
```

> **Historical note**: Earlier documentation showed a 60/30/10 multi-role split
> (60% validators / 30% attesters / 10% burn). The canonical protocol consolidates
> this into the 75/25 model. Within the 75% node pool, individual node shares are
> determined by PoT-normalized weight (see §4). There is no dedicated burn from
> the fee split — ARO burn happens on the emission side (post-TX canonical burn).

### Distribution Steps

1. Collect `commission` from confirmed NodeChain TX (`emission.commission` field).
2. Split: `nodePool = commission × 0.75`; `afcShare = commission × 0.25`.
3. Record `afcShare` to `SYSTEM_AFC_RESERVE_000000000000000000` (ledger: `FEE_DISTRIBUTION`).
4. Sub-distribute `nodePool` to individual nodes by PoT weight (§4).

## 4. Per-Node Share Formula

```
payment_i = nodePool × weight_i

weight_i  = potScore(i) / Σ potScore(all active nodes)

potScore  = α·txCount + β·totalFees − δ·penaltyScore
            (α=1.0, β=2.0, δ=10.0 — see pot.service.ts)
```

Weights are normalized so `Σ weight_i = 1.0` across all active nodes.

## 5. Reference Implementation (TypeScript)

```typescript
// FeeDistributionService.distributeRewards() — src/fee_distribution/fee_distribution.service.ts

const nodePool   = totalFees * 0.75;   // 75% to nodes
const afcReserve = totalFees * 0.25;   // 25% to AFC reserve

// Per node: rewardAmount = nodePool * weight_i
for (const [nodeId, weight] of weights.entries()) {
    const rewardAmount = nodePool * weight;
    // record as TransactionType.VALIDATOR_REWARD
}
```

## 6. Dependencies
- `01_coin_engine/payment_distribution.md` — canonical 75/25 split specification.
- `src/fee_distribution/fee_distribution.service.ts` — implementation.
- `src/proof_of_transaction_engine/pot.service.ts` — PoT weight calculation.

## 7. Notes
- **Epoch-End**: `FeeDistributionService.triggerEpochCycle()` finalizes and distributes at each epoch close.
- **Per-TX**: `EmissionService.processTransactionEmission()` applies the same 75/25 split inline.
- **Audit**: All distribution records feed into the All-Seeing Eye via ledger append-only log.
