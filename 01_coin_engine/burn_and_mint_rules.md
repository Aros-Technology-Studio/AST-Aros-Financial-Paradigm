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

**Canonical (PoT) path** — the primary and authoritative path:
- On every PoT-validated transaction: `emissionAmount = transactionAmount` (1:1).
- Triggered via `EmissionService.processTransactionEmission()` — not discretionary.

**Bridge / FIAT-deposit path** (secondary, for fiat-to-ARO conversion):
- When new fiat is tokenized via Tokenization Pipeline → an equal value of ARO is minted.
- Must be triggered via verified bridge pipeline event.

### 🔒 Minting Constraints

- Canonical PoT minting has no discretionary cap; supply is bounded by real transaction volume.
- Bridge minting events are signed by validator group quorum (≥ 67%).
- Emergency halt via `KILL_SWITCH=true` (environment variable) halts all emission.

### 📦 Minting Mechanism

- Canonical: `EmissionService` mints exactly `txAmount` ARO to the recipient, then burns the same amount atomically (net circulating supply change = 0).
- Bridge: Mint contract accepts `{ eventType, fiatValue, recipientWallet, mintNonce }` and generates `mintProof` for audit log.

---

## 2. Burning Logic

### ✅ When Burning is Triggered

- **Canonical burn** (primary): Emitted ARO are burned atomically at the end of every PoT-validated transaction cycle. Burn amount equals `emissionAmount` (100% of emission). Net circulating supply change = 0.
- **Reverse Tokenization**: ARO burned when crypto is converted back to fiat via the bridge.
- **Fraud/Governance burn**: In confirmed abuse cases, a corrective governance vote may burn stake.

### 🔥 Burn Mechanism

- Canonical: `BURN` ledger record for full `emissionAmount` in the same `QueryRunner` transaction as the mint. Recipient = `SYSTEM_BURN_VAULT_00000000000000000000`.
- Bridge: Burn contract receives `{ burnAmount, originTxID, burnReason }` and updates `burnLedger`.

> **Note**: There is no partial `burnRate` applied to PoT-canonical transactions. The full emitted amount is burned on completion. Any legacy references to a `3% burnRate` on txn fees apply only to bridge/withdrawal flows, not to the canonical emission lifecycle.

---

## 3. Anti-Abuse Mechanisms

| Scenario                    | Protection Mechanism                            |
| --------------------------- | ----------------------------------------------- |
| Excessive emission requests | PoT validation required; no emission without verified TX |
| Reused mint/burn nonces     | Nonce replay detection, rejection with hash log |
| Validator collusion attempt | Randomized quorum rotation every 24h            |
| Emission drift              | All-Seeing Eye audits every emission cycle      |

---

## 4. Canonical Parameters

| Parameter            | Description                                            | Value                  |
| -------------------- | ------------------------------------------------------ | ---------------------- |
| `emissionRatio`      | ARO minted per unit of transaction amount              | 1:1 (exact)            |
| `defaultCommissionRate` | Fee charged on transaction amount                   | 0.5% (0.005)           |
| `nodeShareRatio`     | Share of commission to node pool                       | 75% (0.75)             |
| `afcReserveRatio`    | Share of commission to AFC reserve                     | 25% (0.25)             |
| `fraudPenaltyBurn`   | Amount burned in confirmed abuse cases                 | 100% of stake          |

---

## 5. Governance Hooks

- **The All-Seeing Eye** has override authority for emergency mint freeze or burn nullification.
- Any mint/burn can be challenged within 12h via `ChallengeProtocol`.

---

## 6. Summary

AROS Coin’s burn/mint rules ensure **transparent, controlled, and demand-driven token supply** with clear governance and security oversight. These rules anchor ARO’s economic credibility and functional resilience.

⸻
