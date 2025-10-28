**AROS Tokenomics — Coin Engine**

**Path: AROS-PARADIGM-AST/01_coin_engine/README.md**

Core documentation for the AROS Coin Engine (ACE), the tokenomics module inside AST (Aros Studio Tokenomics). This README describes the crypto-native logic of ArosCoin. It is independent of AFC or ALB — integration with fiat systems happens only through AFC, outside this repository.

⸻

**1) What is the Coin Engine?**

The Coin Engine (ACE) is the deterministic subsystem that defines:
	•	Emission logic for AROS (base unit: arx),
	•	Mint/Burn rules bound to Proof-of-Transaction (PoT),
	•	Reward distribution for validators and network actors,
	•	State transitions audited by NodeChain,
	•	Architectural oversight via The All-Seeing Eye (meta-layer compliance control).

**Design principles:**
	•	Determinism over discretion — every token movement must be reproducible from canonical inputs.
	•	Separation of concerns — emission ≠ conversion ≠ settlement.
	•	Legibility — each rule is expressed as a function with auditable inputs/outputs.

⸻

**2) Directory Layout**

01_coin_engine/
├── README.md                    # This file
├── coin_engine_overview.md      # Narrative architecture & invariants
├── coin_emission_model.md       # Emission schedules & formulas (math spec)
├── coin_use_cases.md            # Canonical flows: rewards, fees, subsidies
├── burn_and_mint_rules.md       # Allowed state transitions & guards
├── reward_distribution.md       # Validator/actor reward logic
├── AROS_Coin_TokenSpec.json     # Machine-readable token spec
├── /specs                       # JSON schemas, OpenAPI fragments
├── /src                         # Reference implementation (TS/Rust)
├── /tests                       # Unit/integration/property tests
└── /fixtures                    # Deterministic samples for test vectors

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
	•	Base unit: arx (1 AROS = 10^6 arx, fixed)
	•	Supply type: Emission-bounded with PoT-weighted rewards
	•	Decimals: 6
	•	Pause switches:
	•	EMISSION_PAUSE (governance circuit-breaker)
	•	MINT_BURN_PAUSE (kill-switch for state transitions)

Machine-readable spec lives in AROS_Coin_TokenSpec.json.

⸻

**5) Emission Model (Summary)**

Emission = Base schedule × Network activity multiplier × Compliance factor.

Base schedule is a predictable curve (piecewise geometric decay). Activity multiplier derives from PoT (volume/uniques/latency buckets). Compliance factor is a capped modifier from The All-Seeing Eye (0.0–1.0).

Mathematical details are in coin_emission_model.md with reference vectors in /fixtures/emission/.

⸻

**6) Mint/Burn & Guards**

Allowed transitions:
	•	MINT[reward] — reward issuance per finalized PoT epoch.
	•	BURN[fees] — protocol fee sink.

Each transition passes through guards:
	1.	Supply invariant: totalSupply_next = totalSupply_prev + Σmint − Σburn.
	2.	Policy window: emission caps per epoch, anti-burst throttling.
	3.	Double-spend prevention via NodeChain event IDs.

See burn_and_mint_rules.md for exhaustive truth tables and failure codes.

⸻

**7) Rewards & Distribution**
	•	Epoch: fixed 600s (example; configurable via env POT_EPOCH_SECS).
	•	Pool split: R_validator, R_operator, R_ecosystem with governance-locked ratios.
	•	Weighting: validator shares proportional to PoT-contributed verified transactions, adjusted by reliability score and slashing events.

Formulas and proofs in reward_distribution.md.

⸻

**8) Configuration**

Environment variables (TypeScript impl):

AROS_DECIMALS=6
POT_EPOCH_SECS=600
EMISSION_BASE_RATE=1.0
EMISSION_DECAY=0.965
COMPLIANCE_MAX_REDUCTION=0.25
NODECHAIN_RPC=http://nodechain:8545
KILL_SWITCH=false

Never store secrets in repo. Use Docker secrets or CI variables. AST has no end-user auth; integration is service-to-service only.

⸻

**9) Reference API (Internal)**

OpenAPI fragments live in /specs/openapi/*.yaml. Typical flows:

9.1 Calculate next emission

POST /v1/emission/next

{
  "epoch": 102934,
  "activity": {"tx_volume": "321904.200000", "unique_senders": 1842, "latency_bucket": "P50"},
  "policy": {"base_rate": 1.0, "decay": 0.965},
  "compliance_factor": 0.92
}

Response:

{"mint_arx": "128900000", "cap_hit": false, "explanations": ["base*decay*activity*compliance"]}

**9.2 Apply mint/burn**

POST /v1/supply/transition

{
  "transition_id": "tx_01HXR...",
  "kind": "MINT_reward",
  "amount_arx": "128900000",
  "evidence": {"nodechain_event": "evt_...", "proof": "0xabc..."}
}

Response:

{"ok": true, "total_supply_arx": "123456789000000"}


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
