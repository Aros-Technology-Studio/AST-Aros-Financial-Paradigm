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

## 4. Canonical Emission Burn (1:1 Model)

Under the canonical emission model (`EmissionService`), ARO tokens are **transient**:
- Emitted ARO are minted 1:1 to the recipient at transaction start.
- The same quantity is burned after the transaction completes.
- Net circulating supply change per canonical TX cycle = **0**.
- The ledger retains full `totalMinted` and `totalBurned` counters for audit.

This burn is automatic and unconditional — it is not governed by a `burnRate` percentage.

## 5. Fee Distribution Parameters

| Parameter          | Description                                     | Value / Notes                      |
| ------------------ | ----------------------------------------------- | ---------------------------------- |
| `commissionRate`   | % of TX amount charged as commission            | default 0.5% (governance-adjustable) |
| `nodeShareRatio`   | Fraction of commission to node pool             | 0.75 (75%, fixed)                  |
| `afcReserveRatio`  | Fraction of commission to AFC reserve           | 0.25 (25%, fixed)                  |
| `fraudPenaltyBurn` | Tokens burned in confirmed governance fraud     | 100% of stake (governance vote)    |

> **Historical note**: Earlier versions defined `dailyMintLimit = 250,000 ARO`,
> `burnRate = 3% of txn fee`, and `mintThreshold = 500,000 ARO`. These parameters
> are superseded by the canonical 1:1 emission model, where supply is organically
> bounded by real transaction volume and post-TX burns are unconditional.

---

## 5. Governance Hooks

- **The All-Seeing Eye** has override authority for emergency mint freeze or burn nullification.
- Any mint/burn can be challenged within 12h via `ChallengeProtocol`.

---

## 6. Summary

AROS Coin’s burn/mint rules ensure **transparent, controlled, and demand-driven token supply** with clear governance and security oversight. These rules anchor ARO’s economic credibility and functional resilience.

⸻
