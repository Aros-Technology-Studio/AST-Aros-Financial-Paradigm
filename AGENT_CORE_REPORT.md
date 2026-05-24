# AGENT_CORE_REPORT — Canonical 1:1 Emission Audit

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-WOVmh`  
**Date:** 2026-05-24  
**Commit:** `feat: canonical 1:1 emission model implementation`  
**Task:** Audit ArosCoin emission logic against the canonical model; fix all deviations

---

## 1. Scope of Analysis

| Path | Purpose |
|------|---------|
| `01_coin_engine/` | Canonical spec docs (emission model, burn/mint rules, aro_emission_protocol) |
| `10_proof_of_transaction_engine/` | PoT engine documentation |
| `src/token/` | Core TypeScript implementation |
| `src/fee_distribution/` | Epoch-level fee distribution |
| `src/proof_of_transaction_engine/` | PoT service & Process Reserve |

---

## 2. Canonical Model (Reference)

Per `01_coin_engine/coin_emission_model.md` and `01_coin_engine/aro_emission_protocol.md`:

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × rate    (default rate = 0.5%)
Node Share   = Commission × 0.75            (75% → processing nodes by PoT weight)
AFC Reserve  = Commission × 0.25            (25% → AFC reserve contract)
Burn         = Emission Amount              (ARO destroyed after TX completes)

Net circulating supply change per canonical TX cycle = 0

AFC Reserve Index = 1.0 + sqrt(totalAfcReserve) / 10_000
```

---

## 3. Module 01 (`01_coin_engine/`)

- **Status:** Active — NOT deprecated. Contains specification documents only; no executable code.
- All formulas, split ratios, and burn rules are aligned with the canonical model.
- Reference implementation correctly points to `src/token/emission.service.ts`.

---

## 4. Module 10 (`10_proof_of_transaction_engine/`)

- **Status:** Documentation only; executable code lives in `src/proof_of_transaction_engine/`.
- `pot.service.ts` — calculates PoT node scores `S_i = α·|TX_i| + β·F_i − δ·P_i` and normalised weights. No emission logic.
- `process_reserve.service.ts` — tracks cumulative validated volume; was used as price source (see §5.3 — **fixed**).

---

## 5. `src/token/` — Findings and Fixes

### 5.1 `emission.service.ts` — ✅ CORRECT (no changes required)

Full canonical lifecycle is correctly implemented:

| Step | Action | Status |
|------|--------|--------|
| 1 | MINT `emissionAmount` (= txAmount, 1:1) → `recipient` | ✅ |
| 2a | FEE_DISTRIBUTION `nodeShare = commission × 0.75` → `NODE_POOL` | ✅ 75% |
| 2b | FEE_DISTRIBUTION `afcShare = commission × 0.25` → `AFC_RESERVE` | ✅ 25% |
| 3 | `updateAfcReserve()` → `reserveIndex = 1.0 + sqrt(total) / 10_000` | ✅ |
| 4 | BURN `emissionAmount` → `BURN_VAULT` | ✅ transient |
| 5 | `SupplySnapshot`: `totalMinted += e`, `totalBurned += e`, `circulating` unchanged | ✅ net-zero |

All four ledger writes execute inside a single `QueryRunner` transaction — atomic.

### 5.2 `token.service.ts` — ✅ CORRECT (dual-path design is intentional)

- `mintForTransaction()` — canonical entry point; delegates to `EmissionService`. ✅
- `mint()` / `burn()` — **legacy fiat-bridge methods** (deposit/withdrawal via Bridge Layer).
  These correctly change circulating supply for fiat ↔ ARO conversions and are a separate,
  intentional use-case distinct from the canonical emission cycle. No change needed.

### 5.3 `tokenomics.service.ts` — ⚠️ BUG FIXED

**Before:** `getCurrentPrice()` returned `processReserve.reserveIndex`, which uses a
logarithmic formula (`log1p / 100`) unrelated to the canonical AFC sqrt formula.

**After:** `getCurrentPrice()` now delegates to `EmissionService.getCurrentEmissionPrice()` —
the authoritative source of the canonical price index.

```typescript
// BEFORE — wrong formula source
getCurrentPrice(): number {
    const state = this.processReserve.getReserveState();
    return state.reserveIndex; // log1p formula — diverges from canonical
}

// AFTER — canonical AFC reserve index
getCurrentPrice(): number {
    return this.emissionService.getCurrentEmissionPrice(); // 1.0 + sqrt(afc) / 10_000 ✅
}
```

---

## 6. `src/fee_distribution/fee_distribution.service.ts` — ⚠️ BUG FIXED

**Problem:** `calculateTotalFees()` summed the `tx.fee` field of all transactions in
the epoch window. In the canonical emission model every ledger entry written by
`EmissionService` has `fee = '0'` — the actual commission value is carried in
`tx.amount` on `FEE_DISTRIBUTION` type rows. The old query therefore always returned
**zero**, making epoch-level reward distribution a complete no-op.

**Before:**
```typescript
// Sums tx.fee — always '0' in canonical emission
.select('SUM(CAST(tx.fee AS DECIMAL))', 'sum')
.where('tx.createdAt BETWEEN :start AND :end', { start, end })
```

**After:**
```typescript
// Sums FEE_DISTRIBUTION amounts directed to the node pool
.select('SUM(CAST(tx.amount AS DECIMAL))', 'sum')
.where('tx.createdAt BETWEEN :start AND :end', { start, end })
.andWhere('tx.type = :type', { type: TransactionType.FEE_DISTRIBUTION })
.andWhere('tx.recipient = :recipient', { recipient: NODE_POOL_ADDRESS })
```

---

## 7. `src/token/token.controller.ts` — ⚠️ MISSING ENDPOINT ADDED

**Problem:** The controller exposed only legacy `POST /token/mint` and `POST /token/burn`
(fiat bridge paths). There was **no HTTP endpoint** for the canonical `mintForTransaction()`
lifecycle, making the canonical emission engine unreachable from the API layer.

**Changes:**

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/token/transaction/emit` | **Canonical 1:1 emission** — full atomic lifecycle |
| `GET  /api/v1/token/emission/price`  | Current AFC reserve index (canonical emission price) |

Legacy endpoints (`/token/mint`, `/token/burn`) preserved for the fiat bridge layer and
annotated `@deprecated` to prevent accidental use for canonical emission.

---

## 8. Summary Table

| File | Status Before | Status After | Change |
|------|--------------|--------------|--------|
| `src/token/emission.service.ts` | ✅ Correct | ✅ Correct | No change needed |
| `src/token/token.service.ts` | ✅ Correct | ✅ Correct | No change needed |
| `src/token/tokenomics.service.ts` | ⚠️ Wrong price formula | ✅ Fixed | Delegates to EmissionService |
| `src/token/token.controller.ts` | ⚠️ No canonical endpoint | ✅ Fixed | Added `/transaction/emit` + `/emission/price` |
| `src/fee_distribution/fee_distribution.service.ts` | ⚠️ Zero-sum fee query | ✅ Fixed | Queries FEE_DISTRIBUTION amounts on node pool |
| `01_coin_engine/` docs | ✅ Canonical spec intact | ✅ Unchanged | Reference only |
| `10_proof_of_transaction_engine/` docs | ✅ Correct | ✅ Unchanged | Reference only |

---

## 9. Canonical Model Compliance: After Fixes

```
Emission     = Transaction Amount  ← EmissionService.calculate()          ✅
Commission   = Amount × 0.005      ← defaultCommissionRate = 0.005        ✅
Node Share   = Commission × 0.75   ← nodeShareRatio = 0.75                ✅
AFC Reserve  = Commission × 0.25   ← afcReserveRatio = 0.25               ✅
Burn         = Emission Amount     ← Step 4 BURN to BURN_VAULT            ✅
Net Supply   = 0 per TX cycle      ← totalMinted == totalBurned           ✅
Price Index  = 1.0+sqrt(afc)/10k   ← EmissionService.getCurrentEmissionPrice() ✅
Epoch Fees   = FEE_DIST amounts    ← Fixed query in FeeDistributionService ✅
API Access   = /transaction/emit   ← New canonical endpoint               ✅
```

---

## 10. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight at epoch end)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 ARO AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.00003535...
  → every subsequent emission is priced higher
```

---

## 11. Recommendations

1. **Persist `AfcReserveState` to database** — currently in-memory; lost on restart.
   Add an `AfcReserveSnapshotEntity` table written after each `updateAfcReserve()` call.

2. **Sync FeeDistributionService with EmissionService AFC index** — `distributeRewards()`
   records AFC on ledger but does not call `EmissionService.updateAfcReserve()`; consider
   calling it after each epoch finalization to keep the in-memory price index accurate.

3. **Add `mintForTransaction()` to ingestion pipeline** — any bridge/ingestion code that
   still calls the legacy `mint()` should be migrated to the canonical endpoint
   `POST /api/v1/token/transaction/emit`.

4. **Unit test coverage for canonical path:**
   - `calculate(10000, 0.005)` → `{emission: 10000, commission: 50, nodeShare: 37.5, afcShare: 12.5}`
   - After `processTransactionEmission`: `totalMinted == totalBurned`, `circulatingSupply` unchanged
   - AFC reserve index grows monotonically across successive transactions
   - `calculateTotalFees()` returns non-zero when FEE_DISTRIBUTION records exist
