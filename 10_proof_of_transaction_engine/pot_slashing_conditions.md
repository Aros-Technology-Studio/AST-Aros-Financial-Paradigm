# PoT Node Accountability — Model 1

**Module:** AST PoT Engine
**Status:** Model-1 Canon
**Updated:** 2026-06-26 (supersedes Model-A draft)

## 1. Purpose

Defines how AST PoT holds nodes accountable for execution quality in NodeChain under
the Model-1 canon. Node influence derives entirely from confirmed work and accumulated
reputation — there is no stake balance to penalise.

## 2. Model-1 Accountability Principles

- **Work-based influence:** Node weight is computed from PoT-verified executions and
  reputation history. A node that fails to attest correctly accumulates no weight and
  earns no commission share.
- **Reputation decay:** The PoT engine tracks attestation quality per epoch. Nodes with
  poor attestation records receive lower weight in future commission distributions.
- **Exclusion, not slashing:** A node whose attestations are invalid is excluded from
  the PoT-confirmed participant set for that process. Its weight for the epoch reflects
  only confirmed work; it earns nothing for unconfirmed participation.
- **No stake register:** There is no staked-balance field in the Node entity. Balance
  cannot be slashed, frozen, or penalised.

## 3. PoT Verdict Gate

A participation is counted toward a node's epoch weight only when the associated
process carries a verdict with `verified === 1`. Invalid attestations produce `verified === 0`,
excluding the node from the distributable pool for that process.

## 4. Implementation References

- Node weight: `src/nodes/nodes.service.ts` — `currentWeight(nodeId)`
- Epoch distribution: `src/commission/commission.service.ts` — `confirmedWeights()`
- PoT verdict: `src/pot/pot.service.ts` — `verify(processId)`
- Spec: `docs/specs/AST_PoT_AGENT_EN.md`, `docs/specs/AST_Commission_AGENT_EN.md`

## 5. Superseded Model-A Content

The previous version of this file described stake-based slashing (slash % of staked
balance). That mechanism belongs to Model-A and is not present in Model-1. The
constructs `getStake`, `burnStake`, and stake-severity formulas do not exist in the
current implementation and must not be introduced. AST_RULES.yaml P1 and P2 prohibit
staking balances and slashing against balance respectively.
