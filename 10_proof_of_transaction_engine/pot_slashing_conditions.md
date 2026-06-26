# PoT Misbehavior Response Conditions

**Module:** AST PoT Engine  
**Status:** Model-1 (updated from Model-A draft)  
**Date:** 2026-06-26  

## 1. Purpose
Defines conditions under which a node's reputation weight is reduced or participation is
suspended in response to PoT misbehavior recorded in NodeChain. Node influence derives from
work quality and reputation — there is no token stake involved (I9, P1, P2).

## 2. Principles
- Proportional: Severity of response scales with severity of misbehavior.
- Automatic: Triggered by anomalies recorded in NodeChain and signaled by All-Seeing Eye.
- Reputation-based: Penalties reduce the node's work-weight and participation eligibility,
  not a token balance.

## 3. Conditions

| Misbehavior                       | Response                                      |
|-----------------------------------|-----------------------------------------------|
| Invalid Attestation               | Reputation weight reduced (25% of current)   |
| No Response to Challenge          | Temporary suspension from active rotation     |
| Repeated Failures (>3/epoch)      | Suspension and exclusion from epoch rewards   |

## 4. Weight Reduction Formula
```
new_weight = current_weight * (1 - severity_factor)
severity_factor ∈ {0.25, 0.50, 1.0} depending on condition
```
All weight reductions are recorded as `node.penalty` events in NodeChain (I3, I8).

## 5. Implementation Reference
See `src/nodes/nodes.service.ts` — `NodesService` holds `reputationWeight` and exposes
`receivePayment` for earned value; there is no stake balance or burn-stake operation.

## 6. Dependencies
- `13_extra_supervisory_layer/` — All-Seeing Eye signals anomalies passively (I10).
- `src/nodechain/nodechain.service.ts` — append-only event recording (I8).

## 7. Notes
- Appeals handled via role-based governance (06_governance_layer/), not token-weighted voting.
- The All-Seeing Eye observes and signals only; it does not enforce or halt (I10, P6).
