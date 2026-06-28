# AST Entity Spec — Emission (Emission Engine) (agent-readable)

_Agent-oriented specification. English structured spec + machine spec (YAML). Model 1. Derived from `AST_сущность_Эмиссия_RU.md`. Emission is the mechanism; the unit itself is specified in the ArosCoin spec._

## English spec

**Entity:** Emission (Emission Engine) — the mechanism that mints and burns ArosCoin strictly within a confirmed process, on the authorizing signal of PoT.
**Module:** `tokenomics_service` (emission function).
**Purpose:** Bring process value into existence as a consequence of confirmed work, and remove it when its purpose ends — keeping total supply causally tied to executed work (P5).

**Responsibilities:**
- On PoT `verified=1`: mint the process part, bound to `processId`; record the mint event.
- On cycle completion: burn the process part; record the burn event.
- Keep supply derivable: `totalSupply = Σ(minted) − Σ(burned)`.

**Emission types:** `process_emission` (mint at verified start). `commission_part` — **[ZONE]**: minted in ArosCoin OR charged in operation value and only accounted in ArosCoin — Ketevan decision; determines whether nodes hold ArosCoin.

**Formulas:** `mint(p) allowed ⟺ verified(p)=1`; `emissionVolume ∝ process.amount`; `totalSupply = Σ(minted) − Σ(burned)`.

**Invariants:** causality (mint bound to verified process); PoT gate; cycle symmetry; no manual mint/burn; supply derivable.

**Scope:** mint/burn of process value strictly tied to a confirmed process. Verdict by PoT; unit is ArosCoin; storage by NodeChain.

## Machine spec (YAML)

```yaml
entity: Emission
aka: EmissionEngine
module: tokenomics_service   # emission function
purpose: Mint/burn ArosCoin strictly within a confirmed process, on PoT signal.
nature: disciplined supply control; no standalone "issue" mode (P5)

emission_types:
  - id: process_emission       # mint of process part at verified start
  - id: commission_part
    zone: "minted_in_arcoin OR charged_in_value_and_accounted  # Ketevan decision; affects whether nodes hold ArosCoin"

operations:
  mint:
    input: { process: Process }
    precondition: "verified(process) == 1"     # PoT gate
    steps: [issue process part, bind to processId, record mint event in NodeChain]
    output: { minted: decimal, processId: ref(Process) }
  burn:
    input: { process: Process }
    trigger: "process cycle completion"
    steps: [burn process part, record burn event in NodeChain]
    output: { burned: decimal }
    note: "earned part is NOT burned; it stays with infrastructure"

formulas:
  mintCondition:  "mint(process) allowed <=> verified(process) == 1"
  emissionVolume: "emissionVolume proportional to process.amount"   # not arbitrary
  supplyIdentity: "totalSupply = sum(minted) - sum(burned)"

invariants:
  - id: I-EM-1  rule: "causality: every mint bound to a confirmed process (P5)"
  - id: I-EM-2  rule: "PoT gate: no mint without verified == 1"
  - id: I-EM-3  rule: "cycle symmetry: process part minted is burned on completion"
  - id: I-EM-4  rule: "no manual mint/burn outside process logic"
  - id: I-EM-5  rule: "supply derivable: totalSupply = sum(minted) - sum(burned)"

prohibitions:           # negative tests
  - no_premine
  - no_free_emission
  - no_manual_mint
  - no_manual_burn
  - no_emission_without_pot

zones:                  # unresolved Model-1/Model-A forks
  - commission_part_form   # see emission_types.commission_part

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  signal_from: PoT
  unit: ArosCoin
  commission: Commission
  records_to: NodeChain
  feeds: Reserve          # minted process volume feeds capitalization
```
