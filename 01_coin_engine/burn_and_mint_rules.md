# ArosCoin — Mint and Burn Rules (Model 1)

## Purpose

This document defines the token lifecycle rules for ArosCoin (ARO) — the unit of account for
confirmed value exchange in AST. Every mint and every burn is causally bound to a confirmed
process verdict; there is no issuance mode that operates outside this gate.

---

## 1. Mint — when and how

### Allowed trigger

A mint is authorized when and only when PoT has issued a verdict of `verified === 1` for a
specific process. The EmissionService reads the recorded verdict before every mint; if no
verdict exists, or if `verified` is not 1, the call throws and the ledger is unchanged.

### Mint mechanics

- Amount: equal to the process transaction amount (1:1 emission — no multiplier, no discount).
- Bound to: the `processId` of the confirmed process.
- Recorded in: NodeChain as `emission.minted { processId, minted }`.
- Ledger effect: `processMinted += amount`.

There is no scheduled mint, no pre-allocation, no mint-on-deposit, and no free issuance.

---

## 2. Burn — when and how

### Trigger

The process part is burned immediately on cycle completion — in the same confirmed process
that produced the mint. The burn mirrors the mint so the process part nets to zero
(`processMinted == processBurned` after each completed cycle).

### Burn mechanics

- Amount: equal to the amount minted for the same process (`emit` calls `burn(minted)`).
- Recorded in: NodeChain as `emission.burned { processId, burned }`.
- Ledger effect: `processBurned += amount`.

The earned part (commission paid to nodes) is never burned; it is retained by nodes as
compensation for confirmed work and lives in `earnedRetained`.

---

## 3. Supply identity

```
totalSupply = (processMinted − processBurned) + earnedRetained
```

Because `processMinted == processBurned` after all cycles complete, `totalSupply` converges
to `earnedRetained`. The full history of mints and burns is auditable from NodeChain.

---

## 4. Guards

| Guard                | Rule                                                              |
|----------------------|-------------------------------------------------------------------|
| PoT gate             | No mint without `verified === 1`; throwing on unauthorized call  |
| NodeChain record     | Every mint and burn appended to the append-only chain            |
| Cycle symmetry       | Burn amount equals mint amount for the same process              |
| Append-only ledger   | `processMinted` and `processBurned` are monotone non-decreasing  |

---

## 5. Canonical values (Model 1)

```
Emission     = Transaction Amount           (1:1)
Commission   = Transaction Amount × 0.005   (0.5%)
  Node share = Commission × 0.75            (75% → nodes by PoT weight)
  AFC share  = Commission × 0.25            (25% → AFC reserve)
Net supply Δ = 0 per completed cycle        (process part minted then burned)
```

---

## 6. Reference

- Spec: `docs/specs/AST_Emission_AGENT_EN.md`, `docs/specs/AST_ArosCoin_AGENT_EN.md`
- Reference implementation: `reference/ast-core/src/emission.ts`, `reference/ast-core/src/aroscoin.ts`
- NestJS services: `src/emission/emission.service.ts`, `src/aroscoin/aroscoin.service.ts`
