# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Previous audit:** `claude/inspiring-cannon-4qbjK` → merged PR #72 (2026-05-12)  
**This audit:** 2026-06-11  
**Task:** Re-audit ArosCoin emission logic; confirm canonical model; fix any remaining gaps

---

## Summary

All canonical model rules are correctly implemented in `src/token/`. Changes in this pass address the HTTP surface and test coverage gaps found during re-audit.

| Requirement | Status |
|------------|--------|
| Emission = TX Amount (1:1) | ✅ `emission = transactionAmount` (`emission.service.ts:58`) |
| Commission = TX Amount × 0.5% | ✅ `commission = transactionAmount * rate` (line 59) |
| Node Share = 75% of commission | ✅ `nodeShare = commission * 0.75` (line 60) |
| AFC Share = 25% of commission | ✅ `afcShare = commission * 0.25` (line 61) |
| ARO burned after TX | ✅ BURN step in `processTransactionEmission()` (lines 151–159) |
| AFC reserve → price rises | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` (lines 196–197) |
| Atomic operations | ✅ `QueryRunner` + rollback (lines 106–181) |
| Module 01 status | ✅ Not deprecated — active documentation |


---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

| File | Pre-patch state | Action |
|------|----------------|--------|
| `coin_emission_model.md` | ✅ Already canonical — 1:1 formula, 75/25 split, AFC index, example | No change needed |
| `aro_emission_protocol.md` | ✅ Already canonical | No change needed |
| `payment_distribution.md` | ✅ Already canonical (75/25 split, PoT weight) | No change needed |
| `burn_and_mint_rules.md` | ✅ Correct burn-on-completion policy | No change needed |
| `README.md` | ✅ Architecture overview, no formula conflicts | No change needed |

**Module 01 is NOT deprecated.** It is pure documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here — correct.

### src/token/ — Full audit

| File | Status | Action |
|------|--------|--------|
| `emission.interfaces.ts` | ✅ Defines `EmissionResult` (with `burnAmount`), `EmissionConfig`, `AfcReserveState` | No change |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle with `KILL_SWITCH` guard, `recordAfcContribution()`, public `updateAfcReserve()` | No change |
| `token.service.ts` | ✅ `mintForTransaction()` canonical entry point; `mint()` (FIAT_DEPOSIT) applies 75/25 split via `calculate()` | No change |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` deprecated no-op; price delegates to reserve | No change |
| `token.module.ts` | ✅ `EmissionService` registered and exported | No change |
| `token.controller.ts` | ❌ No canonical `POST /emit` endpoint; `POST /mint` called legacy path | **Fixed** |
| `token.service.spec.ts` | ❌ No tests for `mintForTransaction()`; duplicate mock declaration conflict | **Fixed** |

### src/fee_distribution/ — Canonical code confirmed correct

| File | Status |
|------|--------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ Applies canonical 75/25 split at epoch finalization |

### src/proof_of_transaction_engine/ — Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | Legacy volume ledger (`log1p` index) — used by `TokenomicsService.getCurrentPrice()` only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Expected | Code state |
|------|----------|-----------|
| Emission = TX Amount | 1:1, no multiplier | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * rate` |
| Fee split: 75% → nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% → AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX completes | Yes | ✅ `BURN` ledger record for `burnAmount` in same atomic TX |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Net circulating supply change per TX | +commission | ✅ `circulatingSupply += commission` in `updateSupplySnapshot` |
| All steps atomic | Yes | ✅ Single `QueryRunner` transaction with rollback on error |

**Conclusion: code fully matches canonical model.**

---

## 3. Changes Made in This Pass

### 3.1 `src/token/token.controller.ts` — New canonical endpoint

Added `POST /api/v1/token/emit` — the HTTP entry point for canonical emission:

```
POST /api/v1/token/emit
Body: { transactionAmount, recipient, referenceId, commissionRate? }

Response: {
  status: "SUCCESS",
  transactionAmount,
  emissionAmount,     // = transactionAmount (1:1)
  commission,         // = txAmount × rate
  nodeShare,          // = commission × 0.75
  afcReserveShare,    // = commission × 0.25
  burnAmount,         // = emissionAmount − commission
  mintTxHash,         // hash of the MINT ledger record
  afcReserveIndex     // current reserveIndex after this emission
}
```

Also added `GET /api/v1/token/emission/price` — returns current AFC reserve state and emission price index.

Deprecated `POST /api/v1/token/mint` — redirected to `mintForTransaction()`.

### 3.2 `src/token/token.service.spec.ts` — Comprehensive tests for `mintForTransaction()`

Added test suite `mintForTransaction — canonical 1:1 emission` covering:

- Delegates to `EmissionService.processTransactionEmission()` with correct arguments
- Custom commission rate forwarded correctly
- `token.emission.canonical` event emitted with canonical fields
- Throws `BadRequestException` on zero or negative transaction amount
- 1:1 invariant: `emissionAmount == transactionAmount`
- Fee invariant: `nodeShare + afcReserveShare == commission`

---

## 4. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ KILL_SWITCH check (halts emission in emergency)
  ├─ calculate():
  │    emissionAmount = txAmount            // 1:1
  │    commission     = txAmount × rate     // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │    burnAmount     = emissionAmount − commission
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ Ledger BURN:             burnAmount  → SYSTEM_BURN_VAULT
  ├─ updateSupplySnapshot()
  ├─ commitTransaction()
  └─ updateAfcReserve(afcShare):
       reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
       (called AFTER commit to prevent in-memory desync on rollback)
```

All four ledger operations execute atomically within a single `QueryRunner` transaction.

### System Addresses

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
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 − 50 = 9,950 ARO (net: commission remains in circulation)
Net circulating change = +50 ARO (= commission, held by node pool and AFC reserve)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000354...
  → every subsequent emission is priced higher
```

---

## 6. Invariants (verified in code)

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split, no rounding loss beyond float precision
3. `burnAmount == emissionAmount − commission` — recipient burns exactly what remains after fee payment
4. `reserveIndex` is monotonically non-decreasing — updated only after successful DB commit
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Changes Applied in This Pass (2026-06-11)

### 6.1 `01_coin_engine/AROS_Coin_TokenSpec.json` — исправлен (2 расхождения)

| Поле | Было | Стало |
|------|------|-------|
| `supplyMechanism.burnOn` | `"governance_rule"` | `"post_transaction_canonical_burn"` |
| `transactionFees.distribution` | `{nodeOperators:0.75, AST treasury:0.20, Audit Pool:0.05}` | `{nodePool:0.75, afcReserve:0.25}` + `distributionNote` |

`burnOn: "governance_rule"` противоречило канонической модели: ARO сгорают автоматически после каждой транзакции, а не по решению governance. Распределение комиссии 75/20/5 противоречило канону 75/25.

### 6.2 `src/token/token.controller.ts` — добавлен канонический эндпоинт

`TokenService.mintForTransaction()` (канонический путь) был реализован, но недоступен через HTTP API. Единственный существующий эндпоинт `POST /api/v1/token/mint` маршрутизировал в legacy `mint()` для FIAT_DEPOSIT — без комиссии, без burn, без AFC-резерва.

**Добавлены эндпоинты:**

```
POST /api/v1/token/emit          — канональная эмиссия (mintForTransaction)
GET  /api/v1/token/emission/price — текущий reserveIndex и состояние AFC резерва
```

`POST /api/v1/token/mint` перенаправлен на `mintForTransaction()` (deprecated для FIAT_DEPOSIT).

### 6.3 `src/token/emission.service.ts` — изменений не потребовалось

Код уже полностью соответствует канонической модели (подтверждено аудитом).

---

## 7. Рекомендации (follow-up)

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with periodic snapshots.
- **Wire `POST /emit` into ingestion pipeline** — replace all `POST /mint` calls in the bridge/ingestion path with the canonical endpoint.
- **Add unit tests for `EmissionService.calculate()`** — cover dust amounts, max commission rate, zero-amount guard.
- **Epoch AFC contribution sync** — `FeeDistributionService` distributes AFC on ledger but should call `EmissionService.updateAfcReserve()` after each epoch finalization to keep the in-memory index accurate.
