# AROS Tokenomics — Coin Engine (Model-1)

**Path: AROS-PARADIGM-AST/01_coin_engine/README.md**

Core documentation for the AROS Coin Engine (ACE), the tokenomics module inside AST (Aros Studio Tokenomics). This README describes the crypto-native logic of ArosCoin under the Model-1 canonical specification. It is independent of AFC or ALB — integration with fiat systems happens only through AFC, outside this repository.

⸻

**1) What is the Coin Engine?**

The Coin Engine (ACE) is the deterministic subsystem that defines:
- **1:1 Emission** bound to Proof-of-Transaction (PoT) — one ARO minted per one unit of confirmed transaction value.
- **Mint/Burn rules** — the process part is minted on PoT confirmation and burned on cycle completion; net supply change per cycle is zero.
- **Commission distribution** — 75% of the fee to processing nodes by PoT-confirmed weight; 25% to the AFC Reserve.
- **State transitions** audited by NodeChain (append-only, hash-linked).
- **All-Seeing Eye** — passive observation of every emission cycle; no enforcement, no state mutation.

**Design principles:**
- Determinism over discretion — every token movement is reproducible from canonical inputs.
- Separation of concerns — emission ≠ conversion ≠ settlement.
- Legibility — each rule is expressed as a function with auditable inputs/outputs.

⸻

**2) Directory Layout**

```
01_coin_engine/
├── README.md                       # This file
├── coin_emission_model.md          # Canonical 1:1 emission formula & examples (Model-1)
├── aro_emission_protocol.md        # Emission trigger sequence and supply invariants
├── coin_use_cases.md               # Canonical flows: payments, fees
├── burn_and_mint_rules.md          # PoT-gated mint/burn transitions & guards
├── burn_mechanism.md               # Process part burn on cycle completion
├── payment_distribution.md         # Node payment logic (work + reputation weight)
├── node_participation_payments.md  # Post-factum payment formula
├── coin_volatility_controls.md     # Reserve index & price stability
└── AROS_Coin_TokenSpec.json        # Machine-readable token spec
```

⸻

**3) Token Specification (Essentials)**

- **Symbol:** AROS
- **Base unit:** arx (1 AROS = 10^6 arx, fixed)
- **Supply type:** Demand-driven; bounded by real confirmed transaction volume
- **Decimals:** 6

Machine-readable spec lives in `AROS_Coin_TokenSpec.json`.

⸻

**4) Canonical Emission Formula (Model-1)**

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × rate    (default rate = 0.5%)
  Node Share = Commission × 0.75            (75% → processing nodes by PoT weight)
  AFC Share  = Commission × 0.25            (25% → AFC reserve)
Burn         = Emission amount              (destroyed after TX completes)
Net supply Δ = 0                            (process part minted then burned; cycle symmetric)
```

Emission is authorized only when PoT records `verified === 1` for the process; an unverified
or inadmissible process mints nothing (`AST_RULES.yaml` invariants I1/I2, prohibition P7).
Full derivation and worked examples: `coin_emission_model.md`.

⸻

**5) Mint/Burn & Guards**

Allowed transitions:
- `MINT[process]` — process part issuance, gated on a PoT `verified === 1` verdict for that process.
- `BURN[process]` — burns the same process part on cycle completion (net 0).

Each transition passes through guards:
1. Supply invariant: `totalSupply = (processMinted − processBurned) + earnedRetained` (I6).
2. PoT gate: no mint without a confirmed verdict (I1/I2, P7).
3. Double-spend prevention via NodeChain event IDs (I3, I8).

See `burn_and_mint_rules.md` for the full transition table.

⸻

**6) Commission & Payments**

- Epoch: caller-supplied `epochNumber` (see `src/commission/commission.service.ts`).
- Pool split: 75% to the node pool (by PoT-confirmed weight), 25% to the AFC reserve — fixed
  ratios, no token-weighted governance (P3).
- Weighting: node shares are proportional to `weight = reputation × uptime`, where
  `reputation = successes / total × uptime` — work and availability, never a held balance (I9,
  P1/P2). See `payment_distribution.md` for formulas and `10_proof_of_transaction_engine/pot_slashing_conditions.md`
  for how misbehavior lowers future weight (never confiscates paid value).

⸻

**7) Configuration**

Environment variables (TypeScript / NestJS implementation):

```
AROS_DECIMALS=6
COMMISSION_RATE=0.005
COMMISSION_MARGIN_RATE=0.25
KILL_SWITCH=false
```

Never store secrets in repo. Use Docker secrets or CI variables. AST has no end-user auth; integration is service-to-service only.

⸻

**8) Reference Implementation (NestJS)**

- `src/emission/emission.service.ts` — `EmissionService.calculate()` / `.mint()` / `.burn()` / `.emit()`
- `src/commission/commission.service.ts` — `CommissionService.computeFee()` / `.accrue()` / `.finalizeEpoch()`
- `src/aroscoin/aroscoin.service.ts` — `ArosCoinService`, the unit ledger (`totalSupply`, `processNet`, `retained`)
- `src/reserve/reserve.service.ts` — `ReserveService.reserveIndex()` (`log10(1 + totalProcessVolume)`)
- `src/nodes/nodes.service.ts` — `NodesService`, reputation-derived weight
- `src/orchestrator/orchestrator.service.ts` — `OrchestratorService.runProcess()`, the full lifecycle

Reference core (behavior is correct by construction): `reference/ast-core/src/`.

⸻

**9) Data & Audit**

- Event store: append-only NodeChain, hash-chained (`src/nodechain`).
- Deterministic execution: identical inputs yield identical verdicts and supply (I4).
- The All-Seeing Eye observes every mint/burn/distribution and compares supply, but never
  halts, reverts, votes, or mutates state (`src/all-seeing-eye`, I10, P6).

⸻

**10) Security & Invariants**

- `KILL_SWITCH=true` halts transitions; read-only mode persists.
- Invariants tested in `src/invariants/invariants.spec.ts` and `reference/ast-core/src/invariants.test.ts`:
  - Supply conservation (`totalSupply == earnedRetained` after cycles complete, I5/I6).
  - Commission pool reconciliation (`Σpayments + margin == Σfees`, I7).
  - NodeChain append-only and hash-continuous (I8).
