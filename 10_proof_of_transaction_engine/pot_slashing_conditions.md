# PoT Node Penalty Conditions (Model 1)

**Module:** AST PoT Engine
**Status:** Canonical (Model 1)
**Updated:** 2026-06-27 — replaces Model-A stake-slashing draft

## 1. Purpose

Defines how the PoT engine penalizes nodes that fail to meet execution standards.
Penalties reduce a node's **reputation score**, which lowers its PoT weight and future
payment share. No token balance is locked, burned from stake, or slashed.

## 2. Principles

- **Reputation-based**: Penalty reduces `successRate` / `uptime` counters, not balance.
- **Work-proportional**: Influence derives from execution quality, not held tokens.
- **Transparent**: Every penalty event is recorded in NodeChain for audit.
- **Proportional**: Severity scales with the degree of misbehavior.

## 3. Penalty Conditions and Effects

| Condition                       | Effect on Node Reputation                        |
|---------------------------------|--------------------------------------------------|
| Invalid attestation             | `successRate` decremented; weight reduced ~25%   |
| No response to challenge        | `uptime` decremented; weight reduced ~50%        |
| Repeated failures (>3/epoch)    | Node flagged inactive; excluded from epoch pool  |

Penalty magnitudes are advisory — the PoT engine records the failure event and the Nodes
module recomputes `reputation = (successes / total) × uptime` and
`weight = reputation × uptime` on the next epoch assignment cycle.

## 4. Formula

```
reputation  = successCount / totalAssignments × uptime
weight      = reputation × uptime
```

A node that accumulates failures sees its weight fall toward zero, receiving proportionally
smaller payment shares until its record recovers across future epochs.

## 5. Implementation

- `src/nodes/nodes.service.ts` — `recordExecution()` updates success/failure counters
- `src/pot/pot.service.ts` — verdict issues failure signals per process
- `src/nodechain/nodechain.service.ts` — penalty events appended as audit records

## 6. What This Module Does Not Do

Stake lockup, `burnStake()`, token-balance confiscation, and governance-slash-votes are
Model-A constructs excluded from Model-1 (project prohibitions P1/P2). Node discipline
in Model-1 operates entirely through reputation and work-record, with no token custody.

## 7. Dependencies

- `docs/specs/AST_Nodes_AGENT_EN.md` — reputation and weight model
- `docs/specs/AST_PoT_AGENT_EN.md` — verdict criteria and failure signaling
- `docs/specs/AST_NodeChain_AGENT_EN.md` — append-only audit trail
