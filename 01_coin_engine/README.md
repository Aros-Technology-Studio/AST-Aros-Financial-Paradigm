**AROS Tokenomics — Coin Engine**

**Path: AROS-PARADIGM-AST/01_coin_engine/README.md**

Core documentation for the AROS Coin Engine (ACE), the tokenomics module inside AST (Aros Studio Tokenomics). This README describes the crypto-native logic of ArosCoin. It is independent of AFC or ALB — integration with fiat systems happens only through AFC, outside this repository.

⸻

**1) What is the Coin Engine?**

The Coin Engine (ACE) is the deterministic subsystem that defines:
	•	1:1 emission logic for ARO tokens — one ARO per unit of verified transaction value,
	•	Mint/Burn rules bound to Proof-of-Transaction (PoT),
	•	Commission distribution to nodes (75%) and the AFC Reserve (25%),
	•	State transitions audited by NodeChain,
	•	Architectural oversight via The All-Seeing Eye (passive observation, no enforcement).

**Design principles:**
	•	Determinism over discretion — every token movement is reproducible from canonical inputs.
	•	Separation of concerns — emission ≠ commission ≠ settlement.
	•	Legibility — each rule is expressed as a function with auditable inputs/outputs.
	•	PoT-causality — no value enters the system without a verified process (verified === 1).

⸻

**2) Directory Layout**

```
01_coin_engine/
├── README.md                    # This file
├── coin_emission_model.md       # Canonical 1:1 emission formula, commission split, reserveIndex
├── aro_emission_protocol.md     # Emission protocol: PoT gate, transient supply, burn symmetry
├── coin_use_cases.md            # Canonical flows: payments, fees, node incentives
├── burn_and_mint_rules.md       # PoT-gated mint/burn rules and guards
├── payment_distribution.md     # Node payment logic: 75/25 split, PoT weight distribution
├── node_participation_payments.md  # Node payment structure: NPI score, payout cycles
├── coin_volatility_controls.md  # Anti-inflationary mechanisms
├── AROS_Coin_TokenSpec.json     # Machine-readable token spec
└── AST Node Infrastructure Specification.md  # Node registration and payment rules
```

⸻

**3) Quick Start**

Prerequisites
	•	Node.js ≥ 20
	•	Docker (optional) for reproducible environments

Install

npm install

Run tests

npm test

Lint & type check

npm run lint && npm run typecheck

⸻

**4) Token Specification (Essentials)**
	•	Symbol: ARO
	•	Base unit: ARO (8 decimal places)
	•	Supply type: Transaction-verified; minted 1:1 per confirmed process, burned on completion
	•	Decimals: 8
	•	Supply identity: `totalSupply = (processMinted - processBurned) + earnedRetained`

Machine-readable spec lives in AROS_Coin_TokenSpec.json.

⸻

**5) Canonical Emission Model**

```
Emission   = Transaction Amount        (1:1 — no multiplier)
Commission = Transaction Amount × 0.5% (default feeRate)
  Node pool  = Commission × 0.75       (75% → distributed to nodes by PoT weight)
  AFC share  = Commission × 0.25       (25% → AFC Reserve, growing the capitalization index)
Burn         = Emission amount          (burned on cycle completion; processNet → 0)
```

### Example: $10,000 transaction

```
TX Amount   = 10,000 ARO
Emission    = 10,000 ARO  (minted, 1:1, PoT-gated)
Commission  = 10,000 × 0.005 = 50 ARO
  Node pool = 50 × 0.75 = 37.50 ARO  (distributed by PoT weight at epoch finalization)
  AFC share = 50 × 0.25 = 12.50 ARO  (routed to AFC Reserve)
Burn        = 10,000 ARO  (destroyed after cycle completes)
Net circulating change = 0
```

⸻

**6) Mint/Burn & Guards**

Allowed transitions:
	•	MINT — issued only for a PoT-verified process (`verified === 1`). No PoT confirmation → no mint.
	•	BURN — the process part is burned on cycle completion; net contribution returns to zero.

Guards:
	1.	PoT gate: mint is refused if the recorded verdict is not `verified === 1`.
	2.	Supply identity: `totalSupply = (processMinted - processBurned) + earnedRetained`.
	3.	NodeChain recording: every mint and burn is appended as `emission.minted` / `emission.burned`.

See burn_and_mint_rules.md for the full rule set.

⸻

**7) Commission & Payments**
	•	Commission pool: fees accrue into an open epoch pool.
	•	Distribution at epoch finalization:
		- 75% → node pool, divided by PoT-confirmed participation weight per active node.
		- 25% → AFC Reserve (recorded as `reserve.afc.accrual` in NodeChain).
	•	Payment is strictly post-factum: earned only for confirmed (PoT-verified) work.
	•	Node influence derives from work output and reputation, not from a held balance.

Formulas and proofs in payment_distribution.md.

⸻

**8) Configuration**

Environment variables (TypeScript implementation):

```
NODECHAIN_DATABASE_URL=postgres://...
NODE_ENV=production
```

Never store secrets in the repository. Use Docker secrets or CI variables.

⸻

**9) Reference API (Internal)**

See `src/emission/emission.service.ts` — `EmissionService`:
- `calculate(txAmount, commissionRate?)` — pure canonical formula, no side effects
- `emit(processId, amount)` — full PoT-gated lifecycle
- `mint(processId, amount)` — mint the process part; throws if `verified !== 1`
- `burn(processId, amount)` — burn the process part on cycle completion

See `src/orchestrator/orchestrator.service.ts` for the full 9-step process lifecycle.

⸻

**10) Capitalization Index**

```
reserveIndex  = log10(1 + totalProcessVolume)
internalPrice = base × reserveIndex
```

Derived entirely from confirmed-work history in NodeChain (`emission.minted` events). AFC accruals are recorded as audit events but do not enter the formula (spec I-RS-1). The index is monotonically non-decreasing: each additional confirmed process raises it (spec I-RS-4).

⸻

**11) Security & Invariants**
	•	PoT causality: every mint is bound to a PoT-verified process (I1, I2).
	•	Cycle symmetry: process part minted then burned per cycle; processNet → 0 (I5).
	•	Supply derivable: totalSupply reconstructible from NodeChain history (I6, I-RS-2).
	•	Pool reconciliation: Σ(payments) + AFC share = Σ(fees) per epoch (I7).
	•	NodeChain integrity: append-only, hash-continuous, tamper-detectable (I8).
	•	All-Seeing Eye: passive observation only — log, compare, signal; no enforcement (I10).
