# AROS Tokenomics — Coin Engine (Model-1)

**Path: AROS-PARADIGM-AST/01_coin_engine/README.md**

Core documentation for the AROS Coin Engine (ACE), the tokenomics module inside AST (Aros Studio Tokenomics). This README describes the crypto-native logic of ArosCoin under the Model-1 canonical specification.

---

## 1. What is the Coin Engine?

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

---

## 2. Directory Layout

```
01_coin_engine/
├── README.md                       # This file
├── coin_emission_model.md          # Canonical 1:1 emission formula & examples (Model-1)
├── coin_use_cases.md               # Canonical flows: payments, fees
├── burn_and_mint_rules.md          # PoT-gated mint/burn transitions & guards
├── burn_mechanism.md               # Process part burn on cycle completion
├── payment_distribution.md         # Node payment logic (work+reputation weight)
├── node_participation_payments.md  # Post-factum payment formula
├── coin_volatility_controls.md     # Reserve index & price stability
└── AROS_Coin_TokenSpec.json        # Machine-readable token spec
```

---

## 3. Token Specification (Essentials)

- **Symbol:** AROS
- **Base unit:** arx (1 AROS = 10^6 arx, fixed)
- **Supply type:** Demand-driven; bounded by real confirmed transaction volume
- **Decimals:** 6

---

## 4. Canonical Emission Formula

```
Emission     = Transaction Amount           (1:1, no multiplier)
Commission   = Transaction Amount × 0.005   (0.5%)
  Node Pool  = Commission × 0.75            (75% → processing nodes by PoT weight)
  AFC Share  = Commission × 0.25            (25% → AFC reserve)
Burn         = Emission amount              (destroyed after TX completes)
Net supply Δ = 0                            (process part minted then burned; cycle symmetric)
```

### Example: 10,000 ARO transaction

```
TX Amount      = 10,000 ARO
Emission       = 10,000 ARO  (minted, 1:1)
Commission     = 10,000 × 0.005 = 50 ARO
  Node pool    = 50 × 0.75  = 37.50 ARO  (distributed by PoT weight)
  AFC reserve  = 50 × 0.25  = 12.50 ARO  (locked in reserve)
Burn           = 10,000 ARO  (destroyed after TX completes)
Net circulating change = 0
```

---

## 5. Mint/Burn Guards

Allowed transitions:
- **MINT** — process part issued for a PoT-confirmed process (`verified === 1`). Refused for any unverified process.
- **BURN** — process part destroyed on cycle completion; mirrors the preceding mint exactly.

Guards:
1. **PoT gate** — no mint without `verified === 1` (I1/I2/P7).
2. **Supply identity** — `totalSupply = (processMinted - processBurned) + earnedRetained` (I6).
3. **Cycle symmetry** — `processNet → 0` after cycle completes; earned value is retained, process part is burned (I5).
4. **Double-spend prevention** — NodeChain event IDs prevent replay.

See `burn_and_mint_rules.md` for full truth tables and failure codes.

---

## 6. Payments & Distribution

- **Epoch:** fixed window (configurable via `POT_EPOCH_SECS`).
- **Pool split:** 75% node pool / 25% AFC reserve (canonical, invariant).
- **Weighting:** node shares proportional to PoT-confirmed participation weight (work + reputation). No stake, no token balance influence.
- **Post-factum:** payment is computed after epoch finalization on confirmed work only (I-CM-5).

Formulas in `payment_distribution.md`.

---

## 7. Capitalization Index

```
reserveIndex = log10(1 + totalProcessVolume)
internalPrice = base × reserveIndex
```

Derived from confirmed-work history in NodeChain; never set as a free authority (I-RS-2). Monotonically non-decreasing in volume (I-RS-4). Rising index means future emissions are priced against accumulated work, organically throttling idle activity.

AFC accruals (the 25% commission share) are recorded in NodeChain as audit entries; they do not enter the `reserveIndex` formula (spec I-RS-1).

---

## 8. Reference Implementation

Production code: `src/emission/emission.service.ts` — `EmissionService`

Key methods:
- `calculate(txAmount, commissionRate?)` — pure canonical formula, no side effects
- `emit(processId, amount)` — PoT-gated lifecycle; returns `EmitResult`
- `mint(processId, amount)` — mint process part; throws if no `verified === 1` verdict
- `burn(processId, amount)` — burn process part on cycle completion
- `totalSupply()` — derived supply via the ArosCoin ledger

Commission split: `src/commission/commission.service.ts` — `CommissionService.finalizeEpoch()`
Reserve index: `src/reserve/reserve.service.ts` — `ReserveService.reserveIndex()`

---

## 9. Security & Invariants

Invariants tested (I1–I10 of `AST_RULES.yaml`):
- **I1/I2:** No mint without PoT confirmation.
- **I5:** Process part nets to zero per cycle.
- **I6:** totalSupply derivable from history.
- **I7:** Commission pool reconciles per epoch.
- **I8:** NodeChain append-only, hash-continuous.
- **I9:** Node influence from work+reputation only; no stake.
- **I10:** All-Seeing Eye is passive — observes and signals; never enforces.
