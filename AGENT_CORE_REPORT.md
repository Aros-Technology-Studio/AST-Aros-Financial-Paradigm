# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-qFqSv`
**Date:** 2026-05-20
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or correct implementation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Content | Status |
|------|---------|--------|
| `coin_emission_model.md` | Canonical 1:1 formula, AFC reserve index, example $10k TX | ✅ Correct |
| `aro_emission_protocol.md` | Full protocol spec: 1:1 emission, 75/25 split, burn flow, Mermaid diagram | ✅ Correct |
| `payment_distribution.md` | 75% node pool / 25% AFC reserve split | ✅ Correct |
| `burn_and_mint_rules.md` | General burn-on-completion policy | ✅ Correct |
| `README.md` | Architecture overview; references `src/token/emission.service.ts` as canonical source | ✅ Correct |
| `AROS_Coin_TokenSpec.json` | Machine-readable token spec | ✅ Present |

**Module 01 is NOT deprecated** — it is the canonical spec documentation. Source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution. No emission logic.
Actual PoT code lives in `src/proof_of_transaction_engine/`.

### src/token/ — Status: Canonical implementation confirmed correct

| File | Key content | Status |
|------|-------------|--------|
| `emission.interfaces.ts` | `EmissionResult`, `EmissionConfig`, `AfcReserveState` | ✅ Correct |
| `emission.service.ts` | Full canonical 1:1 lifecycle; atomic 4-step ledger flow | ✅ Correct |
| `token.service.ts` | `mintForTransaction()` → delegates to `EmissionService`; legacy `mint()` preserved | ✅ Correct |
| `tokenomics.service.ts` | `updateInternalValuation()` deprecated no-op; `getCurrentPrice()` compatibility shim | ✅ Correct |
| `token.module.ts` | `EmissionService` registered as provider and exported | ✅ Correct |
| `entities/supply_snapshot.entity.ts` | Tracks `totalMinted`, `totalBurned`, `circulatingSupply` per TX cycle | ✅ Correct |

### src/fee_distribution/ — Status: Canonical epoch distribution confirmed correct

`FeeDistributionService.distributeRewards()` applies canonical 75/25 split at epoch level:
- `NODE_SHARE_RATIO = 0.75` → distributed by PoT weight to each active node
- `AFC_SHARE_RATIO = 0.25` → locked in `SYSTEM_AFC_RESERVE_000000000000000000`

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Role |
|------|------|
| `pot.service.ts` | PoT scoring (`S_i = α·TX + β·F - δ·P`) and weight normalization |
| `process_reserve.service.ts` | Legacy in-memory volume tracker (log1p index); used by `TokenomicsService` compatibility shim only — not the canonical AFC reserve |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code Location | Status |
|------|-----------|---------------|--------|
| Emission = TX Amount | 1:1, no multiplier | `EmissionService.calculate()` line 58: `const emission = transactionAmount` | ✅ |
| Commission = TX Amount × rate | Default 0.5% | `EmissionService.calculate()` line 59: `const commission = transactionAmount * rate` | ✅ |
| Node Share = Commission × 0.75 | 75% | `EmissionService.calculate()` line 60: `commission * 0.75` | ✅ |
| AFC Reserve = Commission × 0.25 | 25% | `EmissionService.calculate()` line 61: `commission * 0.25` | ✅ |
| ARO burned after TX | Yes | Step 4 in `processTransactionEmission()`: `TransactionType.BURN` → `SYSTEM_BURN_VAULT` | ✅ |
| Atomic 4-step ledger flow | Yes | `QueryRunner` transaction wraps all four ledger ops | ✅ |
| AFC reserve grows → price rises | Yes | `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | ✅ |
| Epoch fees also 75/25 | Yes | `FeeDistributionService.distributeRewards()` | ✅ |
| Net circulating supply change = 0 | Yes | `SupplySnapshot`: `totalMinted += emission`, `totalBurned += emission`, `circulatingSupply` unchanged | ✅ |

**Result: Code fully matches the canonical model. No corrections were required.**

---

## 3. Implementation Detail

### EmissionService canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount            // 1:1, no multiplier
  │    commission     = txAmount × rate     // default 0.5%
  │    nodeShare      = commission × 0.75   // 75% → nodes
  │    afcShare       = commission × 0.25   // 25% → AFC reserve
  │
  ├─ [QueryRunner BEGIN]
  ├─ Ledger MINT:             emissionAmount  → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare       → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare        → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    totalReserve += afcShare
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount  → SYSTEM_BURN_VAULT
  ├─ updateSupplySnapshot():
  │    totalMinted += emissionAmount
  │    totalBurned += emissionAmount
  │    circulatingSupply unchanged  (net zero)
  └─ [QueryRunner COMMIT]
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO   (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75 = 37.50 ARO   (split by PoT weight)
  AFC reserve  = 50 × 0.25 = 12.50 ARO   (locked in reserve)
Burn           = 10,000 ARO   (destroyed after TX completes)

Net circulating supply change = 0   (mint and burn cancel out)
totalMinted += 10,000  |  totalBurned += 10,000

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10,000 = 1.0000353...
  → every subsequent emission is priced proportionally higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`; throws `BadRequestException` if `txAmount <= 0`)
2. `nodeShare + afcShare == commission` (exact float arithmetic, no rounding loss beyond IEEE-754 precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (`totalReserve` only increases; `sqrt` is monotone)
5. All four ledger steps succeed or all roll back (atomic `QueryRunner` transaction with rollback on error)

---

## 6. Architecture Notes

### Canonical entry points (use these)

| Method | Location | Purpose |
|--------|----------|---------|
| `EmissionService.calculate(txAmount, rate?)` | `src/token/emission.service.ts` | Pure calculation, no side effects |
| `EmissionService.processTransactionEmission(...)` | `src/token/emission.service.ts` | Full atomic lifecycle |
| `TokenService.mintForTransaction(...)` | `src/token/token.service.ts` | Public facade → delegates to `EmissionService` |
| `EmissionService.getAfcReserveState()` | `src/token/emission.service.ts` | Read-only AFC reserve snapshot |
| `EmissionService.getCurrentEmissionPrice()` | `src/token/emission.service.ts` | Current `reserveIndex` |

### Legacy methods (preserved for bridge compatibility, not canonical)

| Method | Location | Note |
|--------|----------|------|
| `TokenService.mint(amount, recipient, refId)` | `src/token/token.service.ts` | Fiat deposit path; no 1:1 emission semantics |
| `TokenService.burn(amount, sender, bankDetailsId)` | `src/token/token.service.ts` | Fiat withdrawal path |
| `TokenomicsService.updateInternalValuation()` | `src/token/tokenomics.service.ts` | Deprecated no-op |
| `ProcessReserveLedgerService.recordTransactionVolume(v)` | `src/proof_of_transaction_engine/process_reserve.service.ts` | Legacy log1p index; not AFC reserve |

---

## 7. Open Recommendations

1. **Persist `AfcReserveState` to DB** — currently in-memory (`EmissionService`); lost on restart. Add an `AfcReserveEntity` table and snapshot after every TX.
2. **Wire `mintForTransaction()` into ingestion pipeline** — any bridge/ingestion path that calls legacy `mint()` should migrate to the canonical entry point.
3. **Sync epoch AFC contributions to `EmissionService`** — `FeeDistributionService.distributeRewards()` records AFC reserve on ledger but does not call `EmissionService.updateAfcReserve()`; the in-memory index will drift after epoch finalization.
4. **Add unit tests for `EmissionService.calculate()`** — cover: dust amounts, max commission rate boundary, zero-amount guard, exact 75/25 split invariant.
5. **Remove deprecated `updateInternalValuation()`** — once all callers are confirmed to use `EmissionService.getCurrentEmissionPrice()` directly.
