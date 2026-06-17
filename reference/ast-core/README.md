# AST Core — Aros Studio Tokenomics (Model 1 reference implementation)

A clean, runnable reference core of AST built **directly from the Model-1 agent specs**.
It runs the full process lifecycle end-to-end and enforces the Model-1 invariants as tests.

## Entities (all 10, one module each)
| Module | Entity | Role |
|---|---|---|
| `nodechain.ts` | NodeChain | append-only, hash-linked system of record |
| `stateRecording.ts` | State Recording | capture events, guarantee completeness (P3) |
| `pot.ts` | Proof of Transaction | verify fact of execution, gate emission (P1) |
| `aroscoin.ts` | ArosCoin | process unit; process vs earned supply, internal price |
| `emission.ts` | Emission | mint on PoT-verified, burn on completion (P5, 14.1) |
| `commission.ts` | Commission | fee, epoch pool, post-factum payment by weight (P2) |
| `reserve.ts` | Reserve | own capitalization, reserveIndex |
| `release.ts` | Release | maturity gate to broader circulation (P7) |
| `nodes.ts` | Nodes | execute/validate; influence from work+reputation (no staking) |
| `allSeeingEye.ts` | All-Seeing Eye | passive oversight: observe→log→compare→signal |
| `orchestrator.ts` | AST | full lifecycle wiring (ch. IV) |

## Run
```bash
npm install
npm run demo    # full end-to-end lifecycle
npm test        # Model-1 invariant checks
```

## What this is / is not (yet)
- IS: a correct, runnable Model-1 backbone — all entities, full loop, invariants enforced.
- NEXT to production: persistence (Postgres/ledger), REST/gRPC API, port into the NestJS repo,
  deepen each entity, P2P NodeChain, security/keys, observer-node interface for the Eye.
