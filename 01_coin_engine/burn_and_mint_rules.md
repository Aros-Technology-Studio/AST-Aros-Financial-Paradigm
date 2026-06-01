# Burn and Mint Rules for AROS Coin

## Purpose

This document defines the **token lifecycle logic** for AROS Coin (ARO) through two key mechanisms:

- **Minting** — controlled issuance of new ARO tokens.
- **Burning** — irreversible removal of ARO tokens from circulation.

Both processes are essential for:

- Ensuring deflationary and anti-inflation control,
- Maintaining token demand equilibrium,
- Supporting AST’s transactional economy without uncontrolled supply growth.

---

## 0. Canonical Per-Transaction Burn Cycle (Automatic)

> **This section describes the automated canonical emission cycle.** The governance-level rules in §1–§5 apply to manual and exceptional operations. Every regular transaction goes through the following automatic lifecycle first.

For every verified transaction of amount `A` (canonical path via `EmissionService`):

```
MINT  A ARO  → recipient                    (1:1 emission)
DIST  A × 0.005 × 0.75 ARO → SYSTEM_NODE_POOL    (75% of 0.5% commission, by PoT weight)
DIST  A × 0.005 × 0.25 ARO → SYSTEM_AFC_RESERVE  (25% of 0.5% commission)
BURN  (A − A×0.005) ARO    → SYSTEM_BURN_VAULT   (burnAmount = emission − commission)
```

**Net supply change per TX cycle:**
- `totalMinted += A`
- `totalBurned += A − commission`
- `circulatingSupply += commission` (commission stays in node pool + AFC reserve)

The canonical entry point is `EmissionService.processTransactionEmission()` in `src/token/emission.service.ts`. All four steps execute atomically in a single `QueryRunner` database transaction; on failure all steps roll back.

> **Note on burn amount:** The burn is `emissionAmount − commission`, *not* the full `emissionAmount`. After Steps 2a/2b the recipient’s balance is exactly `emissionAmount − commission`; burning the full emission would create a ledger deficit of `commission` per transaction.

---

## 1. Minting Logic

### ✅ When Minting is Allowed

- When new fiat is tokenized via Tokenization Pipeline → an equal value of ARO is minted.
- When system reserves fall below liquidity threshold, per `mintThreshold` config.
- For technical airdrops or bounty issuance, authorized by The All-Seeing Eye.

### 🔒 Minting Constraints

- Must be triggered via verified pipeline event.
- All minting events are signed by validator group quorum (≥ 67%).
- Daily hard-cap: configurable via `dailyMintLimit` parameter.

### 📦 Minting Mechanism

- Mint contract accepts: `{ eventType, fiatValue, recipientWallet, mintNonce }`.
- Auto-generates `mintProof` for audit log.
- Tokens distributed to wallet or module per purpose.

---

## 2. Burning Logic

### ✅ When Burning is Triggered

- Upon **Reverse Tokenization**: crypto is converted back to fiat.
- When transactional fees are configured to include partial burn (per `feePolicy`).
- In case of detected fraud, via special corrective governance vote.

### 🔥 Burn Mechanism

- Burn contract receives: `{ burnAmount, originTxID, burnReason }`.
- Updates `burnLedger` with full audit metadata.
- Fee Distribution count adjusted and pushed to public index.

---

## 3. Anti-Abuse Mechanisms

| Scenario                    | Protection Mechanism                            |
| --------------------------- | ----------------------------------------------- |
| Excessive mint requests     | Rate-limiter per IP/wallet group                |
| Reused mint/burn nonces     | Nonce replay detection, rejection with hash log |
| Validator collusion attempt | Randomized quorum rotation every 24h            |

---

## 4. Fee Distribution Parameters

| Parameter          | Description                                     | Example Value     |
| ------------------ | ----------------------------------------------- | ----------------- |
| `dailyMintLimit`   | Max ARO that can be minted in 24h               | 250,000 ARO       |
| `burnRate`         | % of fee to burn in each txn (configurable)     | 3% of txn fee     |
| `mintThreshold`    | Minimum reserve balance before new mint allowed | 500,000 ARO       |
| `fraudPenaltyBurn` | Amount burned in confirmed abuse cases          | 100% of stake     |

---

## 5. Governance Hooks

- **The All-Seeing Eye** has override authority for emergency mint freeze or burn nullification.
- Any mint/burn can be challenged within 12h via `ChallengeProtocol`.

---

## 6. Summary

AROS Coin’s burn/mint rules ensure **transparent, controlled, and demand-driven token supply** with clear governance and security oversight. These rules anchor ARO’s economic credibility and functional resilience.

⸻
