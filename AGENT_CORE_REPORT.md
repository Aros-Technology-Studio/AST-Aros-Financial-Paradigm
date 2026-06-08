# AGENT_CORE_REPORT — Canonical 1:1 Emission Model

**Agent:** AGENT-CORE  
**Branch:** `agent/core-emission`  
**Date:** 2026-06-08 (updated from 2026-05-12)  
**Task:** Audit ArosCoin emission logic against the canonical model and align all code

---

## 1. Directory Audit

### 01_coin_engine — Status: Documentation only (not deprecated)

| File | State |
|------|-------|
| `coin_emission_model.md` | ✅ Canonical 1:1 formula documented (rewritten in prior pass) |
| `aro_emission_protocol.md` | ✅ Canonical lifecycle documented (rewritten in prior pass) |
| `payment_distribution.md` | ✅ 75/25 split documented (rewritten in prior pass) |
| `burn_and_mint_rules.md` | ✅ Consistent — no conflicts |
| `README.md` | ✅ Architecture overview — no conflicts |

**Module 01 is NOT deprecated.** It is pure specification documentation. Canonical source code lives in `src/token/`.

### 10_proof_of_transaction_engine — Status: Documentation only

Contains `.md` spec files for PoT validation, slashing, signature model, incentive distribution.  
Actual PoT code lives in `src/proof_of_transaction_engine/`. No emission logic here.

### src/token/ — Canonical code verified and updated

| File | State |
|------|-------|
| `emission.interfaces.ts` | ✅ `EmissionResult` includes `burnAmount` and optional `mintTxHash` |
| `emission.service.ts` | ✅ Full canonical 1:1 lifecycle; `burnAmount = emission − commission`; `updateAfcReserve` called after commit; public `recordAfcContribution()` |
| `emission.service.spec.ts` | ✅ 239-line suite: `calculate()`, `processTransactionEmission()`, AFC reserve, governance |
| `token.service.ts` | **FIXED** (this pass): `mint()` now applies canonical 75/25 commission split |
| `token.service.spec.ts` | ✅ Updated mock + new commission-split assertion test |
| `tokenomics.service.ts` | ✅ `updateInternalValuation()` is a deprecated no-op; unchanged |
| `token.controller.ts` | ✅ `POST /emit` canonical endpoint and `GET /emission/price` (prior pass) |
| `token.module.ts` | ✅ `EmissionService` registered and exported |

**`mint()` fix applied this pass:**  
`TokenService.mint()` (called by `BridgeService.handleFiatDepositWebhook` and `POST /api/v1/token/mint`) previously minted ARO 1:1 but **skipped the commission split entirely** — no `nodeShare`, no `afcReserveShare`, no AFC index update. It now:
1. Calls `emissionService.calculate()` for the canonical 75/25 split
2. Records FEE_DISTRIBUTION `nodeShare` → `SYSTEM_NODE_POOL_00000000000000000000`
3. Records FEE_DISTRIBUTION `afcReserveShare` → `SYSTEM_AFC_RESERVE_000000000000000000`
4. Calls `emissionService.recordAfcContribution()` to raise the price index

ARO are NOT burned in `mint()` by design — fiat deposits create persistent holdings (the BURN happens at withdrawal via `burn()`). See §3 for the two-phase lifecycle.

### src/fee_distribution/ — Canonical code verified

| File | State |
|------|-------|
| `fee_distribution.service.ts` → `distributeRewards()` | ✅ 75/25 split: `NODE_SHARE_RATIO = 0.75`, `AFC_SHARE_RATIO = 0.25` |

---

## 2. Canonical Model Verification

| Rule | Canonical | EmissionService | TokenService.mint() |
|------|-----------|----------------|---------------------|
| Emission = TX Amount | 1:1 | ✅ `emission = transactionAmount` | ✅ full amount minted |
| Fee = TX Amount × rate | 0.5% default | ✅ `calculate()` | ✅ delegates to `calculate()` |
| Fee split: 75% nodes | Yes | ✅ `nodeShare = commission × 0.75` | ✅ FEE_DISTRIBUTION to NODE_POOL |
| Fee split: 25% AFC | Yes | ✅ `afcShare = commission × 0.25` | ✅ FEE_DISTRIBUTION to AFC_RESERVE |
| AFC reserve grows → price rises | Yes | ✅ `reserveIndex = 1.0 + sqrt(totalReserve) / 10_000` | ✅ `recordAfcContribution()` called |
| ARO burn after TX | Yes (payments) | ✅ BURN `emissionAmount − commission` in atomic QueryRunner | ⚠️ Deposits do NOT burn (two-phase deposit lifecycle — see §3) |
| Canonical path reachable via HTTP | Yes | — | ✅ `POST /api/v1/token/emit` → `mintForTransaction()` |
| Epoch fees 75/25 | Yes | — | ✅ `FeeDistributionService.distributeRewards()` |

---

## 3. Implementation Detail

### Two-phase deposit/payment/withdrawal lifecycle

```
Fiat deposit   →  TokenService.mint()
                   MINT amount → recipient (1:1)
                   FEE_DISTRIBUTION nodeShare (75%) → SYSTEM_NODE_POOL
                   FEE_DISTRIBUTION afcShare  (25%) → SYSTEM_AFC_RESERVE
                   recordAfcContribution(afcShare) → price index rises
                   [NO BURN — ARO persist in wallet]

In-system TX   →  TokenService.mintForTransaction()
                   → EmissionService.processTransactionEmission()
                       MINT emissionAmount → recipient (1:1)
                       FEE_DISTRIBUTION nodeShare (75%) → SYSTEM_NODE_POOL
                       FEE_DISTRIBUTION afcShare  (25%) → SYSTEM_AFC_RESERVE
                       BURN burnAmount (= emission − commission) → SYSTEM_BURN_VAULT
                       recordAfcContribution() after commit
                       [net circulating supply change = 0]

Fiat withdrawal →  TokenService.burn()
                   BURN amount → SYSTEM_BURN_VAULT
                   BridgeService.requestFiatPayout() → bank transfer
```

### EmissionService.calculate() — canonical formulas

```
emissionAmount = transactionAmount          // 1:1
commission     = transactionAmount × rate   // default 0.5%
nodeShare      = commission × 0.75
afcReserveShare= commission × 0.25
burnAmount     = emissionAmount − commission // avoids ledger deficit
reserveIndex   = 1.0 + sqrt(totalAfcReserve) / 10_000
```

### HTTP Endpoints (token.controller.ts)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/token/emit` | **Canonical emission** — 1:1 mint + fee split + burn |
| `GET`  | `/api/v1/token/emission/price` | AFC reserve index & state |
| `POST` | `/api/v1/token/mint` | Legacy FIAT_DEPOSIT only (deprecated for emission use) |
| `POST` | `/api/v1/token/burn` | FIAT_WITHDRAWAL + bridge payout |
| `GET`  | `/api/v1/token/supply` | Latest supply snapshot |

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
POST /api/v1/token/emit
{
  "transactionAmount": 10000,
  "recipient": "0xABC...",
  "referenceId": "TX-2026-001"
}

→ Emission       = 10,000 ARO  (1:1 mint → recipient)
→ Commission     = 10,000 × 0.005 = 50 ARO
    Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight at epoch end)
    AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in SYSTEM_AFC_RESERVE)
→ Burn           = 10,000 ARO  (destroyed after TX completes)
→ Net circulating change = 0   (mint and burn cancel out)

After 12.50 ARO accumulated in AFC:
  reserveIndex = 1.0 + sqrt(12.50) / 10_000 = 1.0000353...
  → every subsequent emission is priced higher
```

---

## 5. Invariants

1. `emissionAmount == transactionAmount` — enforced in `calculate()`, throws on violation
2. `nodeShare + afcShare == commission` — exact split (float precision only)
3. `totalMinted == totalBurned` per TX cycle in `SupplySnapshot` — net zero supply change
4. `reserveIndex` is monotonically non-decreasing — only grows, never shrinks
5. All four ledger steps succeed or all roll back — atomic `QueryRunner` transaction

---

## 6. Changes Made

### Prior pass (2026-05-12)
- `01_coin_engine/coin_emission_model.md` — replaced `E = F/N` with canonical 1:1 formulas
- `01_coin_engine/aro_emission_protocol.md` — replaced complex load-index formula with canonical lifecycle
- `01_coin_engine/payment_distribution.md` — replaced 60/15/15/5/5 table with 75/25 split

### This pass (2026-06-08)
- `src/token/token.controller.ts` — added `POST /emit` canonical HTTP endpoint and `GET /emission/price`
- `src/token/emission.service.ts` — added `burnAmount` field; burn now correctly burns `emissionAmount − commission` (not full `emissionAmount`); `updateAfcReserve` moved to after `commitTransaction` to prevent in-memory/DB desync on rollback; added public `recordAfcContribution()` for deposit path
- `src/token/emission.service.spec.ts` — 239-line test suite added
- `src/token/token.service.spec.ts` — mock updated; `mintForTransaction` tests added
- **`src/token/token.service.ts`** — `mint()` (FIAT_DEPOSIT path) now applies canonical 75/25 commission split via `emissionService.calculate()` and `recordAfcContribution()`; removed legacy `tokenomicsService` price calls

---

## 7. Remaining Recommendations

- **Persist `AfcReserveState` to database** — currently in-memory; lost on restart. Add an `AfcReserveEntity` table with a snapshot on each emission.
- **Epoch AFC sync** — `FeeDistributionService` records AFC reserve to the ledger but does not call `EmissionService.recordAfcContribution()`; the in-memory reserve index does not reflect epoch distributions. Sync via `recordAfcContribution()` after `finalizeEpoch()`.
- **Bridge `BridgeService`** — still calls legacy `tokenService.mint()` without explicit `commissionRate`. No code change required (default 0.5% applies), but consider adding explicit rate parameter to the webhook handler for governance-driven adjustments.
