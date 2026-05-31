# Burn and Mint Rules for AROS Coin

## Purpose

This document defines the **canonical token lifecycle** for AROS Coin (ARO):

- **Minting** — transient issuance of ARO tokens triggered exclusively by verified transactions.
- **Burning** — immediate destruction of all minted ARO upon transaction completion.

Both operations execute atomically within a single database transaction (no partial states).

---

## 1. Minting Logic

### ✅ When Minting is Allowed

- When a transaction is verified by Proof-of-Transaction (PoT) — exactly `amount ARO` is minted to the recipient (1:1 ratio).
- No pre-mining, no idle emission, no founder allocations.

### 🔒 Minting Constraints

- Minting is triggered **only** by a verified PoT transaction event.
- Emission amount equals the transaction amount exactly — no multipliers.
- The emission price index (`reserveIndex`) rises monotonically as the AFC reserve grows, making future emissions organically costlier.
- `KILL_SWITCH=true` halts all mint transitions; read-only mode persists.

### 📦 Minting Mechanism

```
SYSTEM_EMISSION_AUTHORITY → MINT emissionAmount → recipient
```

Canonical entry point: `EmissionService.processTransactionEmission(txAmount, recipient, refId)`

---

## 2. Burning Logic

### ✅ When Burning is Triggered

- **Immediately after transaction completion** — all emitted ARO for that cycle are burned (canonical burn).
- The mint and burn occur in the **same atomic transaction**: net circulating supply change per canonical TX cycle = **0**.

### 🔥 Burn Mechanism

```
recipient → BURN emissionAmount → SYSTEM_BURN_VAULT_00000000000000000000
```

Supply audit trail:
- `totalMinted` increases by `emissionAmount`
- `totalBurned` increases by `emissionAmount`
- `circulatingSupply` is unchanged

---

## 3. Commission Split (per canonical TX cycle)

```
Commission   = Transaction Amount × rate    (default 0.5%)
Node Share   = Commission × 0.75            (75% → SYSTEM_NODE_POOL)
AFC Reserve  = Commission × 0.25            (25% → SYSTEM_AFC_RESERVE)
```

The 75/25 split applies at both per-transaction level (`EmissionService`) and epoch finalization (`FeeDistributionService`).

---

## 4. AFC Reserve Price Index

As the AFC reserve accumulates, the emission price rises:

```
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

Sub-linear growth: stable at low volume, meaningful at scale. Acts as the organic supply throttle — no hard cap required.

---

## 5. Anti-Abuse Mechanisms

| Scenario                    | Protection Mechanism                            |
| --------------------------- | ----------------------------------------------- |
| Emission without PoT proof  | `EmissionService` requires verified referenceId |
| Reused mint/burn nonces     | Nonce replay detection, rejection with hash log |
| Validator collusion attempt | Randomized quorum rotation every 24h            |
| Protocol anomaly / exploit  | Multi-sig emergency brake (`KILL_SWITCH=true`)  |

---

## 6. Emergency Brake

`KILL_SWITCH=true` halts all mint and burn transitions. Multi-signature required from:
- All-Seeing Eye
- Oracle Committee
- Founder Authority (if defined in initial config)

---

## 7. Summary

| Rule                    | Canonical Value                                  |
|-------------------------|--------------------------------------------------|
| Emission trigger        | Verified PoT transaction only                    |
| Emission amount         | `= Transaction Amount` (1:1, no multiplier)      |
| Commission rate         | 0.5% (governance-adjustable, bounded 0–100%)     |
| Node pool share         | 75% of commission                                |
| AFC reserve share       | 25% of commission                                |
| Burn trigger            | After transaction completion (same atomic TX)    |
| Net supply change / TX  | 0 (mint and burn cancel out)                     |
| Supply cap              | None — bounded organically by transaction volume |

⸻
