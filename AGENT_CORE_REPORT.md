# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `claude/inspiring-cannon-zkbNF`  
**Date:** 2026-05-16  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code and documentation

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (no source code)

Module 01 is **not deprecated**. It contains specification documents only. The canonical source code lives in `src/token/`.

| File | Status | Notes |
|------|--------|-------|
| `coin_emission_model.md` | ✅ Aligned | Canonical formulas, AFC reserve index, $10K example |
| `aro_emission_protocol.md` | ✅ Aligned | Mermaid sequence diagram, canonical formula table |
| `payment_distribution.md` | ✅ Aligned | 75/25 split documented; historical 60/15/15/5/5 noted as deprecated |
| `burn_and_mint_rules.md` | ✅ No conflict | General burn-on-withdrawal policy; non-contradictory |
| `README.md` | ✅ No conflict | Architecture overview; no formula conflicts |
| `AROS_Coin_TokenSpec.json` | ✅ Read-only | Machine-readable spec; consistent with docs |

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. **No emission logic here.**

### src/token/ — Status: Canonical code confirmed correct

| File | Verified state |
|------|---------------|
| `emission.interfaces.ts` | ✅ Correct — `EmissionResult`, `EmissionConfig`, `AfcReserveState` interfaces |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle: mint→fee split→AFC update→burn |
| `token.service.ts` | ✅ `mintForTransaction()` delegates to `EmissionService`; legacy `mint()` preserved |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is deprecated no-op; price from processReserve |
| `token.module.ts` | ✅ `EmissionService` registered as provider and exported |
| `token.controller.ts` | ⚠️ **Gap fixed this pass** — `POST /api/v1/token/emit` added (see §4) |

### src/fee_distribution/ — Status: Correct

| File | Verified state |
|------|---------------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: 75% node pool, 25% AFC reserve per epoch |

### src/proof_of_transaction_engine/ — Status: Correct, unchanged

| File | Notes |
|------|-------|
| `process_reserve.service.ts` | General process-volume ledger; `reserveIndex` via `log1p` — used by legacy tokenomics only |
| `pot.service.ts` | PoT scoring and weight normalization — correct and untouched |

---

## 2. Canonical Model Verification

| Rule | Canonical | Code state |
|------|-----------|------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` in `EmissionService.calculate()` |
| Fee = TX Amount × rate | default 0.5% | ✅ `commission = transactionAmount * 0.005` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission * 0.75` |
| Fee split: 25% AFC reserve | Yes | ✅ `afcShare = commission * 0.25` |
| ARO burn after TX | Yes | ✅ `BURN` ledger record for `emissionAmount` in same lifecycle |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` |
| Epoch fees also 75/25 | Yes | ✅ `FeeDistributionService.distributeRewards()` |
| HTTP API exposes canonical flow | Was missing | ✅ **Fixed: `POST /api/v1/token/emit` added** |

---

## 3. Implementation Detail

### EmissionService — Canonical lifecycle (`src/token/emission.service.ts`)

```
processTransactionEmission(txAmount, recipient, refId, rate?)
  │
  ├─ calculate():
  │    emissionAmount = txAmount          // 1:1
  │    commission     = txAmount × rate   // 0.5% default
  │    nodeShare      = commission × 0.75
  │    afcShare       = commission × 0.25
  │
  ├─ Ledger MINT:             emissionAmount → recipient
  ├─ Ledger FEE_DISTRIBUTION: nodeShare → SYSTEM_NODE_POOL
  ├─ Ledger FEE_DISTRIBUTION: afcShare  → SYSTEM_AFC_RESERVE
  ├─ updateAfcReserve(afcShare):
  │    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
  ├─ Ledger BURN:             emissionAmount → SYSTEM_BURN_VAULT
  └─ updateSupplySnapshot(): totalMinted++, totalBurned++, circulatingSupply unchanged
```

### System Addresses

| Constant | Address |
|----------|---------|
| `SYSTEM_EMISSION_AUTHORITY` | `SYSTEM_EMISSION_AUTHORITY_00000000000` |
| `SYSTEM_NODE_POOL` | `SYSTEM_NODE_POOL_00000000000000000000` |
| `SYSTEM_AFC_RESERVE` | `SYSTEM_AFC_RESERVE_000000000000000000` |
| `SYSTEM_BURN_VAULT` | `SYSTEM_BURN_VAULT_00000000000000000000` |

---

## 4. Gap Fixed This Pass — Canonical HTTP Endpoint

**Problem:** `TokenController` had no endpoint calling `mintForTransaction()`. The only write endpoint was `POST /api/v1/token/mint` which invokes the legacy `mint()` (FIAT_DEPOSIT, no burn, no AFC split). The canonical `EmissionService` was wired up but unreachable from the API.

**Fix:** Added `POST /api/v1/token/emit` to `src/token/token.controller.ts`:

```typescript
@Post('emit')
async emitForTransaction(
    @Body() body: { transactionAmount: number; recipient: string; referenceId: string; commissionRate?: number },
) {
    const result = await this.tokenService.mintForTransaction(...);
    return { status: 'SUCCESS', ...result, afcReserveIndex: this.emissionService.getCurrentEmissionPrice() };
}
```

**Request example:**
```json
POST /api/v1/token/emit
{
  "transactionAmount": 10000,
  "recipient": "0xABC...",
  "referenceId": "TX_20260516_001"
}
```

**Response example:**
```json
{
  "status": "SUCCESS",
  "transactionAmount": 10000,
  "emissionAmount": 10000,
  "commission": 50,
  "nodeShare": 37.5,
  "afcReserveShare": 12.5,
  "commissionRate": 0.005,
  "afcReserveIndex": 1.0000353
}
```

---

## 5. Example: $10,000 Transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (1:1 mint → recipient)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (split by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (ARO destroyed after TX completes)
Net circulating change = 0   (mint and burn cancel out)

After 12.50 AFC accumulated:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 6. Invariants

1. `emissionAmount == transactionAmount` (enforced in `calculate()`, throws on violation)
2. `nodeShare + afcShare == commission` (exact split, no rounding loss beyond float precision)
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot` (net-zero supply)
4. `reserveIndex` is monotonically non-decreasing (only increases, never decreases)
5. `POST /api/v1/token/emit` is the single canonical HTTP entry point for the 1:1 emission flow

---

## 7. Known Risks / Open Items

| Risk | Severity | Status |
|------|----------|--------|
| `AfcReserveState` is in-memory — lost on restart | Medium | Open — add `AfcReserveEntity` table |
| Ledger steps 1–4 bypass `queryRunner`; supply snapshot is the only atomic part | Medium | Open — pass `queryRunner` to `LedgerService` |
| Legacy `POST /api/v1/token/mint` still callable (FIAT_DEPOSIT path, no canonical burn) | Low | Acceptable — preserved for fiat bridge compat |
| Epoch AFC contribution does not sync `EmissionService.afcReserveState` | Low | Open — call `updateAfcReserve()` post-epoch |

---

## 8. Files Changed This Pass

| File | Change |
|------|--------|
| `src/token/token.controller.ts` | Added `POST /api/v1/token/emit` canonical emission endpoint |
| `AGENT_CORE_REPORT.md` | Updated (this document) |
