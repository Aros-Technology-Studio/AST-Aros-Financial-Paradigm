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

- **Canonical emission:** For every verified transaction of amount `A`, exactly `A` ARO are minted (1:1 emission via `EmissionService.processTransactionEmission()`).
- When new fiat is tokenized via the Tokenization Pipeline → an equal value of ARO is minted through the canonical emission engine.
- For technical airdrops or bounty issuance, authorized by The All-Seeing Eye (must still pass through canonical emission path).

### 🔒 Minting Constraints

- Must be triggered via verified pipeline event.
- All minting events are signed by validator group quorum (≥ 67%).
- Emission is organically bounded by real transaction volume (1:1 ratio) — no fixed daily cap.
- The AFC reserve price index (`reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000`) rises with each TX, acting as the natural throttle against artificial inflation.

### 📦 Minting Mechanism

- Mint contract accepts: `{ eventType, fiatValue, recipientWallet, mintNonce }`.
- Auto-generates `mintProof` for audit log.
- Tokens distributed to wallet or module per purpose.

---

## 2. Burning Logic

### ✅ When Burning is Triggered

- **Canonical emission burn:** After every transaction completes, the full `emissionAmount` (= `transactionAmount`) is burned. This is automatic — net circulating supply change per TX cycle = 0.
- Upon **Reverse Tokenization**: crypto is converted back to fiat (bridge withdrawal path via `TokenService.burn()`).
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

## 4. Canonical Emission Parameters

| Parameter          | Description                                                               | Canonical Value               |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------- |
| `emissionRate`     | ARO minted per unit of transaction amount                                 | 1:1 (emission = TX amount)    |
| `commissionRate`   | Fee charged on each transaction (governance-adjustable)                   | 0.5% of TX amount (default)   |
| `nodeShareRatio`   | % of commission distributed to the node pool (by PoT weight)             | 75%                           |
| `afcReserveRatio`  | % of commission locked in the AFC reserve contract                        | 25%                           |
| `burnTrigger`      | ARO burned after transaction completes — same amount as emitted           | 100% of emission amount       |
| `fraudPenaltyBurn` | Amount burned in confirmed abuse cases (governance slashing)              | 100% of stake                 |

> **Note:** There is no fixed `dailyMintLimit` or `mintThreshold` in the canonical emission model.
> Supply is bounded organically by real transaction volume (1:1).
> The AFC reserve price index serves as the protocol throttle against speculative activity.

---

## 5. Governance Hooks

- **The All-Seeing Eye** has override authority for emergency mint freeze or burn nullification.
- Any mint/burn can be challenged within 12h via `ChallengeProtocol`.

---

## 6. Summary

AROS Coin’s burn/mint rules ensure **transparent, controlled, and demand-driven token supply** with clear governance and security oversight. These rules anchor ARO’s economic credibility and functional resilience.

⸻
