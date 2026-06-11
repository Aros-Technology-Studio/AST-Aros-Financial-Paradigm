# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-qs3chl`  
**Audit date:** 2026-06-11 (re-audit; original audit 2026-05-12, PR #72 / commit `f6239f9`)  
**Task:** Audit ArosCoin emission logic against the canonical model; confirm or fix code; document findings.

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (NOT deprecated)

| File | Content | Status |
|------|---------|--------|
| `coin_emission_model.md` | Canonical 1:1 formula, AFC reserve index, 75/25 split, example | ✅ Correct (aligned in PR #72) |
| `aro_emission_protocol.md` | Canonical emit→fee_split→burn lifecycle with mermaid diagram | ✅ Correct (aligned in PR #72) |
| `payment_distribution.md` | Canonical 75/25 split; PoT weight formula | ✅ Correct (aligned in PR #72) |
| `burn_and_mint_rules.md` | General burn-on-withdrawal policy; no contradictions | ✅ Unchanged |
| `README.md` | Architecture overview; no formula conflicts | ✅ Unchanged |

**Module 01 is NOT deprecated.** It is pure documentation. The canonical source code lives in `src/token/`.

---

### 10_proof_of_transaction_engine — Status: Does not exist as a top-level folder

The task referenced this path; it does not exist at the repository root. The PoT implementation lives at:
- `src/proof_of_transaction_engine/` — source code (`pot.service.ts`, `process_reserve.service.ts`)
- `10_proof_of_transaction_engine/` does not contain emission logic and was not found in the tree.

No emission logic is present in the PoT layer — it handles scoring and weight normalisation only.

---

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ `EmissionResult`, `EmissionConfig`, `AfcReserveState` — all fields match spec |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle — confirmed correct (see §2) |
| `emission.service.spec.ts` | ✅ Unit tests added in this pass (§6) |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy bridge `mint()`/`burn()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; `getCurrentPrice()` uses process reserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |

---

### src/fee_distribution/ — Status: Canonical code confirmed correct

`fee_distribution.service.ts → distributeRewards()` applies the canonical **75/25 split** over epoch-level collected fees. Both per-transaction (EmissionService) and per-epoch (FeeDistributionService) layers use identical ratios.

---

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | In-memory process-volume ledger; `reserveIndex` via `log1p` — used only by legacy tokenomics price display |
| `pot.service.ts` | PoT scoring and weight normalisation — untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical spec | Code (`src/token/emission.service.ts`) |
|------|---------------|----------------------------------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `calculate()` line 58 |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` line 59 |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` line 60 |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` line 61 |
| ARO burned after TX completes | Yes | ✅ `BURN` ledger record for `emissionAmount` in atomic transaction (step 4, line 138) |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` in `updateAfcReserve()` line 175 |
| Atomic execution | All-or-rollback | ✅ Single `QueryRunner` transaction; `rollbackTransaction()` on any failure |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` constants: `NODE_SHARE_RATIO=0.75`, `AFC_SHARE_RATIO=0.25` |

**Verdict: Code is fully compliant with the canonical model. No rewrites required.**

---

## 3. Emission Lifecycle (confirmed flow)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount            // 1:1
  │    commission     = txAmount × 0.005   // default 0.5%
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ BEGIN ATOMIC TRANSACTION
  │    ├─ LEDGER MINT:             emissionAmount → recipient
  │    ├─ LEDGER FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  │    ├─ LEDGER FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
  │    ├─ updateAfcReserve(afcShare):
  │    │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000  ← price rises
  │    └─ LEDGER BURN:             emissionAmount → SYSTEM_BURN_VAULT
  │
  ├─ updateSupplySnapshot():
  │    totalMinted       += emissionAmount
  │    totalBurned       += emissionAmount
  │    circulatingSupply  = unchanged  (net zero)
  │
  └─ COMMIT
```

---

## 4. System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75 = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25 = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel)

reserveIndex after this TX:
  = 1.0 + sqrt(12.50) / 10_000
  = 1.0 + 3.5355... / 10_000
  ≈ 1.00003536
  → every subsequent emission priced higher
```

---

## 6. Changes Made in This Pass

### Added: `src/token/emission.service.spec.ts`

Unit tests covering:
- `calculate()` — 1:1 emission, commission split, guard on zero/negative amounts
- `processTransactionEmission()` — ledger call sequence, atomic rollback on failure
- `updateAfcReserve()` — monotonically rising `reserveIndex`, correct formula
- `getCurrentEmissionPrice()` — returns `reserveIndex` from AFC state

This addresses recommendation #3 from the 2026-05-12 audit pass.

---

## 7. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`; throws `BadRequestException` on violation)
2. `nodeShare + afcShare == commission` (exact arithmetic split, no protocol-level rounding loss)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero circulating supply)
4. `reserveIndex` is monotonically non-decreasing (only ever increases)
5. All four ledger steps succeed or all roll back (single atomic `QueryRunner` transaction)

---

## 8. Open Recommendations (carry-forward)

| # | Recommendation | Priority | Status |
|---|---------------|----------|--------|
| 1 | **Persist `AfcReserveState` to DB** — currently in-memory; lost on restart. Add `AfcReserveEntity` with periodic snapshots or load-on-boot from latest snapshot. | High | Open |
| 2 | **Wire `mintForTransaction()` into ingestion pipeline** — `ingestion.service.ts` line 27 has a commented-out mint call; should use `mintForTransaction()` not legacy `mint()` to ensure canonical emission fires on crypto-asset ingestion. | Medium | Open |
| 3 | **Unit tests for `EmissionService.calculate()`** | Medium | ✅ Done (this pass) |
| 4 | **Sync epoch AFC into `EmissionService`** — `FeeDistributionService.distributeRewards()` records the epoch AFC ledger entry but does not call `EmissionService.updateAfcReserve()`; the in-memory `reserveIndex` will under-count after epoch finalization. | Medium | Open |
