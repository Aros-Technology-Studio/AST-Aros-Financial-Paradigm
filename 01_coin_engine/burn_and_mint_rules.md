# Burn and Mint Rules for AROS Coin

## Purpose

This document defines the **token lifecycle logic** for AROS Coin (ARO) through two mechanisms:

- **Minting** — controlled 1:1 issuance of ARO tokens, strictly bounded by verified transaction volume.
- **Burning** — automatic, irreversible removal of the same ARO tokens after the transaction completes.

---

## Canonical Model

Every mint-burn pair is **atomic and net-zero**:

```
Emission  = Transaction Amount          (1:1, no multiplier)
Fee       = Transaction Amount × rate   (default 0.5%)
  Nodes   = Fee × 0.75                  (distributed by PoT weight)
  AFC     = Fee × 0.25                  (locked in SYSTEM_AFC_RESERVE)
Burn      = Emission                    (destroyed after TX completes)
Net circulating change = 0
```

Reference implementation: `src/token/emission.service.ts` → `EmissionService.processTransactionEmission()`

---

## 1. Minting Rules

### When Minting is Allowed

- One mint per verified transaction, of exactly the transaction amount (1:1).
- The mint is initiated by `SYSTEM_EMISSION_AUTHORITY_00000000000`.
- No minting outside a verified PoT-confirmed transaction cycle.

### Minting Constraints

- **Amount**: exactly equal to `transactionAmount` — no multipliers, no pre-allocation.
- **No speculative mint**: minting cannot be triggered by reserve shortfall or governance fiat.
- **Double-spend prevention**: each `referenceId` may trigger at most one emission cycle.
- All mint ledger records carry `operation: 'CANONICAL_1_1_EMISSION'` in metadata.

### Minting Mechanism

```
MINT txn: SYSTEM_EMISSION_AUTHORITY → recipient
  amount    = transactionAmount
  fee       = 0
  metadata  = { referenceId, operation: 'CANONICAL_1_1_EMISSION' }
```

---

## 2. Burn Rules

### When Burning is Triggered

- Immediately after the same transaction cycle that produced the mint.
- The emitted ARO travel from `recipient → SYSTEM_BURN_VAULT_00000000000000000000`.
- All four ledger steps (MINT, FEE×2, BURN) execute in a single atomic DB transaction.

### Burn Mechanism

```
BURN txn: recipient → SYSTEM_BURN_VAULT_00000000000000000000
  amount    = emissionAmount  (same value as MINT)
  fee       = 0
  metadata  = { referenceId, operation: 'POST_TX_CANONICAL_BURN' }
```

`SupplySnapshot` records `totalMinted += emissionAmount` and `totalBurned += emissionAmount` so the audit trail is complete while `circulatingSupply` remains unchanged.

---

## 3. Fee Distribution

Commission is split in the **same atomic transaction** as mint/burn:

| Recipient | Share | Address constant |
|-----------|-------|-----------------|
| Node pool | 75% | `SYSTEM_NODE_POOL_00000000000000000000` |
| AFC reserve | 25% | `SYSTEM_AFC_RESERVE_000000000000000000` |

Ledger type: `TransactionType.FEE_DISTRIBUTION` with `operation: 'NODE_FEE_75PCT'` / `'AFC_RESERVE_25PCT'`.

At epoch finalization, `FeeDistributionService.distributeRewards()` applies the same 75/25 split to accumulated epoch fees and routes individual node rewards by PoT-normalized weight.

---

## 4. AFC Reserve Price Index

As the AFC reserve grows, the emission price index rises:

```
reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
```

Sub-linear: stable at low volume, meaningful at scale. Never decreases.

---

## 5. Anti-Abuse Mechanisms

| Scenario | Protection |
|----------|-----------|
| Replay of referenceId | Each `referenceId` maps to exactly one emission cycle |
| Excessive emission | No emission without a verified PoT transaction event |
| Validator collusion | Randomized quorum rotation every 24h (NodeChain) |
| Kill-switch | `KILL_SWITCH=true` halts all transitions; read-only mode |

---

## 6. Governance Hooks

- Commission rate is adjustable via governance within protocol bounds `(0, 1)` exclusive.
- **The All-Seeing Eye** has override authority to freeze emission (sets `EMISSION_PAUSE`).
- Burn nullification is **not permitted** — burned tokens are irrecoverable by design.

---

## 7. Invariants

1. `emissionAmount == transactionAmount` — enforced in `EmissionService.calculate()`
2. `nodeShare + afcShare == commission` — exact arithmetic split
3. `totalMinted == totalBurned` per canonical TX cycle in `SupplySnapshot`
4. `reserveIndex` is monotonically non-decreasing
5. All four ledger steps succeed atomically or all roll back

⸻
