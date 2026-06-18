# AST Entity Spec — Reserve (Reserve Logic) (agent-readable)

_Agent-oriented spec. English + YAML. Model 1. Derived from `AST_сущность_Резерв_RU.md`. Reserve = AST own capitalization from confirmed work (not custodial backing)._

## English spec

**Entity:** Reserve (Reserve Logic) — AST's own capitalization accumulated from confirmed work, expressed as `reserveIndex`; basis for internal valuation and maturity.
**Module:** `tokenomics_service` (capitalization function).
**Purpose:** Convert confirmed volume into a measure of the economy's depth/robustness that underpins ArosCoin valuation and Release readiness.

**Responsibilities:** aggregate confirmed volume from NodeChain; compute `reserveIndex`; feed internal price, Release condition, and AST Strength.

**Formulas:** `reserveIndex = log10(1 + totalProcessVolume)`; `ArosCoin_internalPrice = base × reserveIndex`; contributes to `strength`.

**Invariants:** grows only from confirmed work; derivable from history (not assigned); own value (not custody); monotonic with volume.

**Scope:** account AST own capitalization. Custody of third-party funds / 100% asset backing belongs to a different model and external executors `[ZONE]`.

## Machine spec (YAML)

```yaml
entity: Reserve
aka: ReserveLogic
module: tokenomics_service    # capitalization function
purpose: AST own capitalization from confirmed work; basis for valuation & maturity.

data:
  derived_from: NodeChain      # totalProcessVolume = aggregate of tx with verified==1
  reserveIndex: derived        # not stored as authority; recomputed from history

formulas:
  reserveIndex:  "reserveIndex = log10(1 + totalProcessVolume)"   # log: soft long-term growth
  internalPrice: "ArosCoin_internalPrice = base * reserveIndex"
  strengthInput: "reserveIndex feeds strength = f(totalProcessVolume, verifiedTxCount, institutionalVolume)"

invariants:
  - id: I-RS-1  rule: "grows only from confirmed volume (P1)"
  - id: I-RS-2  rule: "derivable: reserveIndex recomputed from NodeChain; not set manually"
  - id: I-RS-3  rule: "own value, not custody of third-party funds"
  - id: I-RS-4  rule: "monotonic: totalProcessVolume up -> reserveIndex non-decreasing"

zones:
  - own_capitalization_vs_100pct_backing   # Model 1 keeps own capitalization; 100% asset backing = Model A

dependencies:
  observed_by: AllSeeingEye   # passive oversight: read-only metadata in, one-way integrity signals out
  source: PoT_volume
  prices: ArosCoin
  gates: Release
  feeds: Strength
  margin_from: Commission
  data_from: NodeChain
```
