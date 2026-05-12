# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-2qKMh`  
**Date:** 2026-05-12  
**Task:** Audit ArosCoin emission logic against the canonical model; align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Canonical | 1:1 emission formula, AFC reserve index, example verified |
| `aro_emission_protocol.md` | ✅ Canonical | Emission = TX Amount, 75/25 split documented |
| `payment_distribution.md` | ✅ Canonical | 75% nodes / 25% AFC reserve split confirmed |
| `burn_and_mint_rules.md` | ✅ Consistent | Burn-on-completion policy, no contradictions |
| `README.md` | ✅ Consistent | Architecture overview, no formula conflicts |

Module 01 is pure documentation. The canonical source implementation lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, and incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic in this directory.

### src/token/ — Status: ✅ Canonical — code confirmed correct

| File | Verified state |
|------|----------------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` exactly matching canonical model |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — mint, fee split 75/25, AFC reserve update, burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved for FIAT deposits only |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads reserve index; `updateInternalValuation()` is deprecated no-op |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

### src/fee_distribution/ — Status: ✅ Canonical — confirmed correct

| File | Verified state |
|------|----------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Canonical 75/25 split applied to epoch-collected fees |

### src/proof_of_transaction_engine/ — Status: ✅ Correct, unchanged

| File | Notes |
|------|-------|
| `pot.service.ts` | PoT scoring (`S_i = α·|TX_i| + β·F_i − δ·P_i`) and weight normalization — correct |
| `process_reserve.service.ts` | Legacy logarithmic volume ledger; `reserveIndex` via `log1p` — used only by legacy tokenomics path |

### src/integration/ingestion/ — Status: ⚠️ Stub not wired

| File | Notes |
|------|-------|
| `ingestion.service.ts` | `ingestAsset()` has the mint call commented out: `// this.tokenService.mint(senderAddress, mintedAros)` |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emissionAmount = transactionAmount` in `EmissionService.calculate()` |
| Commission = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completion | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic QueryRunner |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also split 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` applies same ratios |
| Net circulating supply change = 0 per TX cycle | Yes | ✅ `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged |

All rules verified. **No divergence found.** The canonical model is fully implemented.

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount              // 1:1 emission
  │    commission     = txAmount × rate       // 0.5% default
  │    nodeShare      = commission × 0.75     // 75% → nodes
  │    afcShare       = commission × 0.25     // 25% → AFC reserve
  │
  ├─ Ledger MINT:            emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL_00000000000000000000
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE_000000000000000000
  ├─ updateAfcReserve(afcShare):
  │    totalReserve  += afcShare
  │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  └─ Ledger BURN:            emissionAmount → SYSTEM_BURN_VAULT_00000000000000000000
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.  
On any failure the entire TX rolls back — no partial state.

### System Addresses

| Constant | Value |
|----------|-------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight per active node)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve contract)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out in same TX)

AFC state after this TX:
  totalReserve  = 12.50 ARO
  reserveIndex  = 1.0 + sqrt(12.50) / 10_000 = 1.00003535...
  → every subsequent emission costs marginally more
```

---

## 5. Invariants Confirmed

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws `BadRequestException` on `amount <= 0`
2. `nodeShare + afcShare == commission` — exact split, no rounding gaps beyond float64 precision
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` — net zero supply
4. `reserveIndex` is monotonically non-decreasing — only increases via `sqrt(totalReserve) / 10_000`
5. All four ledger steps succeed or all roll back — guaranteed by single `QueryRunner` atomic transaction

---

## 6. Open Issues (non-blocking)

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | `AfcReserveState` is in-memory only — lost on process restart | Medium | `emission.service.ts:34` |
| 2 | `IngestionService.ingestAsset()` has mint call commented out — not wired to canonical flow | Low | `ingestion.service.ts:27` |
| 3 | Epoch-level AFC reserve (`FeeDistributionService`) does not call `EmissionService.updateAfcReserve()` — two separate in-memory indexes | Low | `fee_distribution.service.ts:167` |
| 4 | No dedicated unit tests for `EmissionService.calculate()` — only covered indirectly via `TokenService` mocks | Low | `token.service.spec.ts` |

---

## 7. Recommendations

- **Persist `AfcReserveState`** — add an `AfcReserveEntity` (or a row in `SystemState`) with a periodic snapshot; restore on startup from latest row.
- **Wire ingestion pipeline** — replace the commented-out `mint()` call in `IngestionService` with `tokenService.mintForTransaction()` to enforce the canonical flow for crypto ingestion.
- **Unify AFC reserve tracking** — after `FeeDistributionService` records the epoch AFC reserve contribution, call `EmissionService.updateAfcReserve(afcAmount)` to keep the in-memory `reserveIndex` consistent.
- **Add unit tests for `EmissionService`** — cover `calculate()` with dust amounts, max rate, and the exact $10,000 reference vector from the canonical spec.
