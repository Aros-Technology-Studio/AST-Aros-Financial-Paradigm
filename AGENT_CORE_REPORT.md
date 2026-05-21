# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE
**Branch:** `claude/inspiring-cannon-nvRu5`
**Date:** 2026-05-21
**Task:** Audit ArosCoin emission logic against the canonical model; fix any deviations; persist AFC reserve state

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formulas, AFC reserve index, $10k example |
| `aro_emission_protocol.md` | ✅ Canonical formulas + Mermaid sequence diagram |
| `burn_and_mint_rules.md` | ✅ Compatible burn-on-withdrawal policy |
| `payment_distribution.md` | ✅ 75/25 node/AFC split documented |
| `README.md` | ✅ Architecture overview — no formula conflicts |

**Module 01 is NOT deprecated** — it is pure documentation.
The canonical source of truth lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Status: Canonical code confirmed + AFC persistence added

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult`, `EmissionConfig`, `AfcReserveState` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; **AFC reserve now persisted to DB** |
| `entities/afc_reserve_snapshot.entity.ts` | ✅ **NEW** — persists AFC reserve state across restarts |
| `entities/supply_snapshot.entity.ts` | ✅ Tracks `totalMinted`, `totalBurned`, `circulatingSupply` |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService` (canonical entry point) |
| `tokenomics.service.ts` | ✅ `getCurrentPrice()` reads `processReserve.reserveIndex`; `updateInternalValuation()` is no-op |
| `token.module.ts` | ✅ `AfcReserveSnapshotEntity` registered in `TypeOrmModule.forFeature()` |

### src/fee_distribution/ — Status: Correct, unchanged

| File | State |
|------|-------|
| `fee_distribution.service.ts → distributeRewards()` | ✅ 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `log1p`-based index for legacy tokenomics |
| `pot.service.ts` | PoT scoring + weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| AFC reserve survives restart | Previously: NO | ✅ **Fixed** — persisted via `AfcReserveSnapshotEntity` + `onModuleInit` restore |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |

---

## 3. Change Made This Pass

### Problem
`EmissionService.afcReserveState` was held entirely in memory.
On any service restart (deploy, crash, container recycle), the AFC reserve total and
`reserveIndex` reset to `{ totalReserve: 0, reserveIndex: 1.0 }`, breaking the monotonic
price index guarantee that is fundamental to the canonical model.

### Fix

**New file: `src/token/entities/afc_reserve_snapshot.entity.ts`**

```
afc_reserve_snapshots table
  id                  uuid PK
  totalReserve        decimal(30,8)
  reserveIndex        decimal(20,10)
  transactionCount    int
  triggerReferenceId  varchar(128)
  createdAt           timestamptz
```

**Updated: `src/token/emission.service.ts`**

- Implements `OnModuleInit`; on startup reads the latest `AfcReserveSnapshotEntity` row and
  restores `afcReserveState` from it.
- `updateAfcReserve()` is now `async` and saves a new snapshot row after every state update.
- `processTransactionEmission()` now `await`s the reserve update (was fire-and-forget).

**Updated: `src/token/token.module.ts`**

- Added `AfcReserveSnapshotEntity` to `TypeOrmModule.forFeature([...])`.
- Global entity auto-discovery via `entities: [__dirname + '/**/*.entity{.ts,.js}']` in
  `AppModule` picks it up automatically for schema sync.

---

## 4. Canonical Lifecycle — Final State

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ [atomic QueryRunner transaction]
  │    ├─ Ledger MINT:             emissionAmount → recipient
  │    ├─ Ledger FEE_DISTRIBUTION: nodeShare      → SYSTEM_NODE_POOL
  │    ├─ Ledger FEE_DISTRIBUTION: afcShare       → SYSTEM_AFC_RESERVE
  │    ├─ updateAfcReserve(afcShare, refId):
  │    │    totalReserve  += afcShare
  │    │    reserveIndex   = 1.0 + sqrt(totalReserve) / 10_000
  │    │    → save AfcReserveSnapshotEntity row  ← NEW
  │    ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  │    └─ save SupplySnapshot (totalMinted++, totalBurned++, circulating unchanged)
  │
  └─ emit 'token.emission.canonical' event (All-Seeing Eye hook)
```

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve + persisted)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated (and persisted):
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
  → value survives service restart ← NEW
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. All ledger steps + reserve persist succeed or all roll back (atomic `QueryRunner`)
6. AFC reserve state restored on restart (`onModuleInit` reads latest DB snapshot)

---

## 7. Remaining Recommendations

- **Epoch AFC → EmissionService sync**: `FeeDistributionService` records AFC reserve on the
  ledger but does not call `EmissionService.updateAfcReserve()`. Consider syncing the
  in-memory + DB index after each epoch finalization so epoch fees also raise the price index.
- **Wire `mintForTransaction()` into ingestion pipeline**: Replace any remaining `mint()` calls
  in the bridge/ingestion path with the canonical entry point.
- **Unit tests for `EmissionService`**: Cover dust amounts, max commission rate, zero-amount
  guard, and now the `onModuleInit` restore path.
