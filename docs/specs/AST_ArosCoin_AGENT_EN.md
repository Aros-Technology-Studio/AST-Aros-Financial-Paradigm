# AST Entity Spec — ArosCoin (agent-readable)

_Agent-oriented specification. English structured spec + machine spec (YAML). Model 1. Derived from `AST_сущность_ArosCoin_RU.md`. ArosCoin is the unit; its mint/burn mechanism is specified in the Emission spec._

## English spec

**Entity:** ArosCoin — the process unit of account of AST, in which value created by a confirmed value-exchange is expressed.
**Module:** `tokenomics_service`.
**Purpose:** Carry process value: bind the proven fact "work executed and verified" to a concrete, measurable quantity that can be counted, paid out, and retained.

**Roles (staged):**
- `process_unit` — serves a single operation; born and (in its process part) burned.
- `payment_unit` — the unit in which node payment for executed work is denominated (P2); this part is retained (P6).
- `mature_settlement_unit` — after Release Phase, broader circulation; inactive until then.

**Value split (core):** the value issued for a process divides into a **process part** (burned on cycle completion — does not accumulate) and an **earned part** (paid for executed work, retained by nodes/AST). Thus "value only from work" and "the system holds value" coexist: what is held is the earned part.

**Formulas:** `internalPrice = base × reserveIndex`; `retainedSupply = Σ(earnedRetained)`; `processNet = Σ(processMinted) − Σ(processBurned) → 0`.

**Invariants:** origin from verified=1; earned-only acquisition; dual fate (burn/retain); bounded circulation pre-Release; supply derivable from NodeChain.

**Scope:** expresses and accounts process value (measurement, payment, retention, internal valuation). Mint/burn is done by Emission; authorization by PoT; storage by NodeChain.

## Machine spec (YAML)

```yaml
entity: ArosCoin
module: tokenomics_service
purpose: Process unit of account expressing value from a confirmed value-exchange.
nature: process-derived carrier of value; fate is dual (burn vs retain)

roles:
  - id: process_unit            # base role, born then (process part) burned
  - id: payment_unit            # denominates node payment for executed work (P2); retained (P6)
  - id: mature_settlement_unit  # active only after Release Phase

value_split:
  process_part: burned_on_completion     # does not accumulate
  earned_part:  retained_by [Nodes, AST] # earned for executed work (P6)

data_model:
  SupplySnapshot:
    processMinted: decimal     # issued for processes
    processBurned: decimal     # burned on completion (process part)
    earnedRetained: decimal    # earned and retained (nodes, AST)
    timestamp: timestamp
  source: derived_from(NodeChain events)   # supply is computed, not assigned

formulas:
  internalPrice:   "ArosCoin_internalPrice = base * reserveIndex"
  retainedSupply:  "retainedSupply = sum(earnedRetained)"
  processNet:      "processNet = sum(processMinted) - sum(processBurned)  # -> 0 for completed"

invariants:
  - id: I-AC-1  rule: "origin: unit exists only when verified == 1 (P1)"
  - id: I-AC-2  rule: "earned-only acquisition: only via executed work (P6)"
  - id: I-AC-3  rule: "dual fate: process part burned, earned part retained"
  - id: I-AC-4  rule: "bounded circulation: internal roles only until Release Phase (P7)"
  - id: I-AC-5  rule: "supply derivable from NodeChain history"

prohibitions:           # negative tests
  - no_purchase
  - no_farming
  - no_premine
  - no_speculative_hold
  - no_free_market_before_release

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  minted_burned_by: Emission
  gated_by: PoT
  denominated_in_payment_by: Commission
  priced_by: Reserve            # internalPrice depends on reserveIndex
  recorded_in: NodeChain
  expanded_by: Release
```
