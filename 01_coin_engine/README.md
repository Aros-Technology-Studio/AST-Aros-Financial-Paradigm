**AROS Tokenomics — Coin Engine**

**Path: AROS-PARADIGM-AST/01_coin_engine/README.md**

Core documentation for the AROS Coin Engine (ACE), the tokenomics module inside AST (Aros Studio Tokenomics). This README describes the crypto-native logic of ArosCoin. It is independent of AFC or ALB — integration with fiat systems happens only through AFC, outside this repository.

⸻

**1) What is the Coin Engine?**

The Coin Engine (ACE) is the deterministic subsystem that defines:
	•	Fee Distribution logic for AROS (base unit: arx),
	•	Mint/Burn rules bound to Proof-of-Transaction (PoT),
	•	Payment distribution for validators and network actors,
	•	State transitions audited by NodeChain,
	•	Architectural oversight via The All-Seeing Eye (meta-layer compliance control).

**Design principles:**
	•	Determinism over discretion — every token movement must be reproducible from canonical inputs.
	•	Separation of concerns — emission ≠ conversion ≠ settlement.
	•	Legibility — each rule is expressed as a function with auditable inputs/outputs.

⸻

**2) Directory Layout**

```
01_coin_engine/
├── README.md                    # This file
├── coin_engine_overview.md      # Narrative architecture & invariants
├── coin_emission_model.md       # Fee Distribution schedules & formulas (math spec)
├── coin_use_cases.md            # Canonical flows: payments, fees, subsidies
├── burn_and_mint_rules.md       # Allowed state transitions & guards
├── payment_distribution.md       # Validator/actor payment logic
├── AROS_Coin_TokenSpec.json     # Machine-readable token spec
├── /specs                       # JSON schemas, OpenAPI fragments
├── /src                         # Reference implementation (TS/Rust)
├── /tests                       # Unit/integration/property tests
└── /fixtures                    # Deterministic samples for test vectors
```
If some files are missing in your repo, keep this structure and create stubs. Tests should pass with --update-snapshots only when invariants remain intact.

⸻

**3) Quick Start**

Prerequisites
	•	Node.js ≥ 20 or Rust ≥ 1.78 (choose one track)
	•	Docker (optional) for reproducible environments

Install (TypeScript track)

pnpm i # or npm i / yarn

Run tests

pnpm test

Lint & type check

pnpm lint && pnpm typecheck


⸻

**4) Token Specification (Essentials)**
	•	Symbol: AROS
	•	Base unit: arx (1 AROS = 10^8 arx, fixed)
	•	Supply type: Fee Distribution-bounded with PoT-weighted payments
	•	Decimals: 8
	•	Pause switches:
	•	EMISSION_PAUSE (governance circuit-breaker)
	•	MINT_BURN_PAUSE (kill-switch for state transitions)

Machine-readable spec lives in AROS_Coin_TokenSpec.json.

⸻

**5) Emission Model (Summary)**

Emission = Transaction Amount (1:1 — no multiplier, no decay curve).

For each verified transaction of amount `A`:
- `A` ARO are minted to the recipient.
- A commission (`A × rate`, default 0.5%) is split: **75% → node pool**, **25% → AFC reserve**.
- The emitted `A` ARO are burned on transaction completion (net circulating supply change = 0).
- The AFC reserve accumulates → emission price index rises monotonically (`reserveIndex = 1.0 + sqrt(totalReserve) / 10_000`).

Full mathematical spec: `coin_emission_model.md`. Reference implementation: `src/token/emission.service.ts`.

⸻

**6) Mint/Burn & Guards**

Allowed transitions:
	•	MINT[payment] — payment issuance per finalized PoT epoch.
	•	BURN[fees] — protocol fee sink.

Each transition passes through guards:
	1.	Supply invariant: totalSupply_next = totalSupply_prev + Σmint − Σburn.
	2.	Policy window: emission caps per epoch, anti-burst throttling.
	3.	Double-spend prevention via NodeChain event IDs.

See burn_and_mint_rules.md for exhaustive truth tables and failure codes.

⸻

**7) Payments & Distribution**
	•	Epoch: fixed 600s (example; configurable via env POT_EPOCH_SECS).
	•	Commission split: **75% → node pool**, **25% → AFC reserve** (applies both per-TX and per-epoch finalization).
	•	Validator allocation: each node receives `nodePool × (potScore_node / Σ potScore_all_nodes)`.
	•	PoT weight: function of `txCount`, `validations`, `penaltyScore`; normalized to sum = 1.0.

Formulas and proofs in payment_distribution.md.

⸻

**8) Configuration**

Environment variables (TypeScript impl):

AROS_DECIMALS=8
POT_EPOCH_SECS=600
EMISSION_COMMISSION_RATE=0.005
NODE_SHARE_RATIO=0.75
AFC_RESERVE_RATIO=0.25
NODECHAIN_RPC=http://nodechain:8545
KILL_SWITCH=false

Never store secrets in repo. Use Docker secrets or CI variables. AST has no end-user auth; integration is service-to-service only.

⸻

**9) Reference API (Internal)**

OpenAPI fragments live in /specs/openapi/*.yaml. Typical flows:

9.1 Calculate emission (pure, no side effects)

POST /v1/emission/calculate

{
  "transactionAmount": 10000,
  "commissionRate": 0.005
}

Response:

{
  "transactionAmount": 10000,
  "emissionAmount": 10000,
  "commission": 50,
  "nodeShare": 37.5,
  "afcReserveShare": 12.5,
  "commissionRate": 0.005
}

**9.2 Process canonical emission (mint + fee split + burn, atomic)**

POST /v1/emission/process

{
  "transactionAmount": 10000,
  "recipientAddress": "addr_...",
  "referenceId": "tx_01HXR..."
}

Response:

{"ok": true, "emissionAmount": "10000.00000000", "afcReserveIndex": 1.0000353}


⸻

**10) Data & Audit**
	•	Event store: append-only log (hash-chained) mirrored to NodeChain.
	•	Deterministic snapshots: created per epoch; reproducible from fixtures.
	•	Audit adapters: write-ahead to audit-logger service; external read to compliance tools.

⸻

**11) Security & Invariants**
	•	Zero-trust networking: service identity → mutual TLS; no public endpoints.
	•	KillSwitch: KILL_SWITCH=true halts transitions; read-only mode persists.
	•	Time consistency: monotonic epoch clock synced via Gateway; drift alarms.
	•	Invariants tested:
	•	Supply conservation under random sequences,
	•	Idempotency on transition replay,
	•	Bounded emission per policy caps.
