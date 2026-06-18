# AST Ontology (Aros Studio Tokenomics) — Full Technical Version (agent-readable)

_One-to-one agent-language analog of `Онтология_AST_полная_RU.md`. Same 17 chapters + appendices A–F, same numbering, same `[ZONE]` flags. English structured spec; YAML for machine-critical parts (schema, formulas, invariants, modules, principles). Model 1. AST as a standalone independent entity (no AFC)._

**Document rules:** positive definitions only; single term "payment for executed work"; AST is an independent legal entity and token-economy that holds its own value and is licensed; ArosCoin is earned via PoT and retained by the earner (speculative hold / farming / premine forbidden); each idea stated once, then referenced.

**`[ZONE: …]`** marks unresolved Model-1 / Model-A forks for Ketevan's decision.

**Status:** draft v1 (full technical), under review.

---

## I. Nature of AST

**1.1 Definition.** AST (Aros Studio Tokenomics) is a sovereign crypto-economic system in which value arises exclusively through a confirmed process of value-exchange. It is an architectural-mathematical mechanism that forms value through work and through the act of value-exchange itself. Value appears as the result of a confirmed exchange; it does not pre-exist.

**1.2 Legal entity & regulatory status.** AST is a self-sufficient, independent legal entity. As a token-economy with its own emission, circulation, and retention of value units, AST holds its own value and falls under crypto/VASP licensing in its jurisdiction of registration (Georgia — NBG regime). AST carries its own regulatory obligations as a distinct subject.

**1.3 Process economy.** Value does not exist as pre-created capital, pools, or free supply. It arises only as the result of an executed and confirmed process, always bound to a concrete action. Value serves execution, not accumulation-for-its-own-sake or speculation.

**1.4 Jurisdiction boundaries.** AST's jurisdiction covers only processes and objects arising from executing operations inside the system: process emission of ArosCoin, task distribution to nodes, state registration in NodeChain, payment distribution for work, the lifecycle of process value (including burning). End-user interaction and conversion of external fiat/crypto assets are the competence of external executors.

**1.5 Self-sufficiency.** AST would exist without any external caller: it has its own emission, its own execution chain (NodeChain), its own nodes, and its own economy. External systems may call it but do not govern it (see Ch. XV).

---

## II. First Principles (P1–P8)
_Each principle stated once; the document references them by id._

- **P1 — Value from confirmed action.** Value is admissible only where execution is proven by Proof of Transaction. It is the result of the process, not its precondition.
- **P2 — Payment post-factum.** Payment occurs only after work is executed and confirmed; never for promise, readiness, or presence. It is payment for an executed function, not a reward for the right to participate.
- **P3 — Inevitable state recording.** An action not recorded in NodeChain has no architectural validity.
- **P4 — Deterministic execution.** Identical inputs yield the same admissible result; no subjective deviation.
- **P5 — Process emission.** Emission is possible only as part of a confirmed process; premine, free emission, and monetary policy are excluded.
- **P6 — Earned retention.** What is earned for work is retained by the earner (nodes, AST). Speculative hold, farming, and passive yield are forbidden.
- **P7 — Bounded circulation.** ArosCoin's circulation mode depends on system maturity; broad circulation occurs only after Release Phase.
- **P8 — Mathematical provability.** Value formation and confirmation are verified mathematically (Ch. X, XVI, Appendix D), not by discretion.

---

## III. Architectural Entities

- **3.1 Proof of Transaction (PoT).** Mechanism that verifies the fact of execution; verdict is established by institutional/process validation (consensus not required). Necessary condition for value (P1). Module: `proof_of_transaction_engine`.
- **3.2 NodeChain.** Sovereign execution-and-registration chain: decentralized processing by registered nodes with state fixation as ExecutionSnapshots. Provides historicity, continuity, audit. Module: `nodechain_engine`.
- **3.3 ArosCoin.** Process unit of account. Minted at the start of a verified process; the process part may burn on completion, the earned part is retained (P6). Acquired only by earning; broad market mode only after Release Phase (P7). Module: `tokenomics_service`.
- **3.4 Emission Engine.** Process-emission subsystem: computes and emits ArosCoin strictly for a specific confirmed process (P5); has no free-issue mode.
- **3.5 Commission Engine.** Computes the transaction fee, consolidates it into the operational pool, and triggers post-factum payment to nodes (Ch. VI).
- **3.6 State Recording Engine.** Records all significant process events in NodeChain (P3); builds the audit trail.
- **3.7 Reserve Logic.** Accounts AST's **own** capitalization — accumulated value from confirmed work (reserveIndex, Ch. XVI); the token-economy's own reserve, not custody of third-party funds. `[ZONE: separate "AST own capitalization" from "100% backing of an external asset" — the latter belongs to rejected Model A; see 13.3, XI.]`
- **3.8 Release Mechanism.** Subsystem activating broader ArosCoin circulation when maturity conditions are met (Ch. XII). Module: `release_daemon`.
- **3.9 Bridge Layer.** `[ZONE: in clean Model 1, standalone-AST performs no mint-on-deposit against external fiat (that is Model A / doc #3). Bridge Layer's role requires a decision: remove it, or redefine it as an interface to external executors with no custodial emission.]`
- **3.10 All-Seeing Eye.** Passive supra-process read-only meta-observation layer (`extra_supervisory_layer`): observes metadata across layers, detects structural anomalies/drift, logs immutably, emits one-way integrity signals ("witness, not judge"); no execution authority (no halt/vote/state-change). Module: `ast/extra_supervisory_layer`. See AllSeeingEye spec.

---

## IV. Process Lifecycle

1. **Initiation** — an admissible process request arrives (internal or external caller, Ch. XV).
2. **Admissibility check** — conformity to architectural context and rules.
3. **Task assignment to nodes** — by weight, role, load (Ch. VIII).
4. **Data fragmentation & routing** — work distributed across nodes.
5. **State recording in NodeChain** — start and intermediate stages fixed (P3).
6. **Process completion** — execution confirmed by PoT (P1).
7. **Commission distribution** — post-factum payment to nodes from the pool (P2, Ch. VI).
8. **Burn of the process value part** — after cycle completion (P6: process part burns, earned part remains).
9. **System metric update** — reserveIndex, velocity, AST Strength (Ch. XVI).
10. **Final state record & confirmation** — irreversible fixation of the result.

Corresponding data flows and modules: Appendix C (flows), Appendix A (modules).

---

## V. ArosCoin as a Multi-level Unit

- **5.1 Process unit of value.** Base role: internal unit serving a specific operation; born and (in its process part) burned.
- **5.2 Infrastructure payment unit.** Accounting unit in which node payment for executed work is recognized (P2). Earned part retained (P6).
- **5.3 Mature settlement/market unit.** After Release Phase (Ch. XII) ArosCoin may move to broader circulation; until then only roles 5.1–5.2 are active.
- **5.4 Circulation limits.** Until Release Phase ArosCoin is a bounded internal unit (P7); acquisition outside earning is forbidden (P6).

---

## VI. Emission & Burn Mechanics

- **6.1 Process emission.** Mint of ArosCoin's process part for the volume of a specific operation (formula — Appendix D). Only within a confirmed process (P5).
- **6.2 Commission emission / accrual.** Formation of the commission part used to pay infrastructure. `[ZONE: clarify — commission accrued as part of ArosCoin emission, OR charged in transaction value and only accounted in ArosCoin. Determines whether nodes hold ArosCoin or are paid in value.]`
- **6.3 Burn of the process part.** The process value part is destroyed on cycle completion — preventing idle-value accumulation and speculation.
- **6.4 Commission pool.** Consolidates the fee for post-factum node payment. Module: `settlement_controller` / fee-distribution.
- **6.5 Commission distribution.** A node's share is proportional to its weight in the transaction (`paymentToNode` — Appendix D).

---

## VII. Execution Economics

- **7.1 Transaction Value.** The value processed in an operation; basis for fee and metrics (PoT_volume).
- **7.2 Commission / Fee.** `fee = tx.amount × feeRate` (fixed or dynamic, Ch. XVI / Appendix D).
- **7.3 Node Compensation.** Post-factum payment to a node for confirmed work (`paymentToNode`).
- **7.4 Operational Layer Funding.** Funding of AST's operational layer from the fee pool (after node payment — AST's own margin/reserve).
- **7.5 External conversion costs.** `[ZONE: "Anchor Conversion Fees" belong to external conversion executors, outside standalone-AST jurisdiction (1.4). Keep as a reference to external costs or remove.]`

---

## VIII. Nodes & Distributed Infrastructure

- **8.1 Node role.** Registration in NodeChain, accepting tasks, executing infrastructure work (validation, routing, fixation), receiving payment by fact (P2).
- **8.2 Node function limits.** A node executes a strictly assigned function: it does not initiate emission, change rules, or convert external assets.
- **8.3 Reputation model.** `nodeReputation = Σ(successful) / Σ(total) × uptimeFactor` (Appendix D). Drives weight and task distribution. Module: `node_reputation_service`.
- **8.4 Task distribution.** By weight (role, task volume, load, reputation) and epoch weight adjustment (decayFactor — stale nodes lose influence).
- **8.5 Penalties & disconnection.** Penalty Curve for non-participation (cumulative penalty / exponential trust decay); disconnection of bad-faith nodes. No staking — penalties hit reputation/admission, not a locked share.

---

## IX. NodeChain (detailed)

- **9.1 Architecture.** Append-only chain of states; each state cryptographically linked to the previous one (previousHash), forming a verifiable sequence. States are ExecutionSnapshots validated by node behavior (validity rests on rule-conformance, not on expended hashpower).
- **9.2 State registration.** Mandatory fixation of lifecycle events (Ch. IV, P3).
- **9.3 Immutability.** A recorded state is not rewritten; history is immutable and reconstructable.
- **9.4 Audit & monitoring.** Full cryptographic reconstructability; external and internal audit.
- **9.5 Fault tolerance.** Node distribution; continued operation when part of the infrastructure drops out; deterministic result (P4).

---

## X. Proof of Transaction (detailed)

- **10.1 Nature of PoT.** Institutional/process validation of the fact of execution; the verdict establishes an objective fact by rule-checking (consensus by power or stake is not used).
- **10.2 Value confirmation.** Value is valid only when `tx.verified = 1` by PoT (P1).
- **10.3 Distinction from PoW/PoS (clarifying comparison).** PoW credits compute power; PoS credits locked stake — both pay for participation/possession of a resource. PoT pays for **executed and confirmed work** — payment for a function, not a reward for participation. Hence no mining, no staking, no consensus reward. (Patent-relevant.)
- **10.4 PoT ↔ emission.** Emission is triggered only by PoT confirmation (P5).
- **10.5 PoT ↔ economics.** Confirmed volume (PoT_volume) feeds stability metrics (reserveIndex, AST Strength — Ch. XVI).

---

## XI. Reserve & Tokenization `[ZONE — boundary with Model A]`

- **11.1 Own capitalization (Model 1).** AST reserve = accumulated capitalization from confirmed work (reserveIndex); the token-economy's own value.
- **11.2 Tokenization / Reverse Tokenization.** `[ZONE: in doc #3 (Model A) tokenization = mint on fiat deposit and burn on withdrawal (custodial, backed). Absent in Model 1 standalone-AST. Decide: remove external-asset tokenization entirely — or scope it to external executors outside AST.]`
- **11.3 Reference ID & double-emission prevention.** Useful in Model 1 too: unique binding of emission to a process, protection against re-emission for one event. Keep.
- **11.4 100% reserving.** `[ZONE: "100% backing of an asset" is Model A. In Model 1 it is replaced by "capitalization from confirmed work" (11.1). Needs decision whether the notion of reserving remains and in what sense.]`

---

## XII. Release Phase

- **12.1 Activation conditions.** Transition to broad circulation only when maturity conditions are met.
- **12.2 Release Daemon.** `if reserveIndex > threshold AND velocity > target: activate(ReleasePhase)` (Appendix D). Module: `release_daemon`.
- **12.3 Role of Reserve Index.** Measure of accumulated capitalization (maturity).
- **12.4 Velocity Factor.** Measure of circulation activity; module `velocity_tracker`.
- **12.5 Transition to circulation.** Before activation — only internal ArosCoin roles (5.1–5.2); after — extended mode (5.3).

---

## XIII. Legal Nature & Liability

- **13.1 Legal nature.** AST is an independent legal entity, a licensed token-economy (1.2).
- **13.2 Liability limits.** AST is responsible for its own sphere (1.4); not liable for actions of external executors and calling systems.
- **13.3 Reserving.** See `[ZONE]` 11.1 / 11.4: own capitalization — yes; custodial 100% backing of an external asset — no (Model A).
- **13.4 Prohibition of speculative emission.** P5 in the legal plane: emission only from confirmed activity.
- **13.5 Cross-jurisdiction compatibility.** Keys and data bound to jurisdiction (invariant); compatibility with different regulators' regimes via licensed status.

---

## XIV. Architectural Prohibitions
_(Each prohibition has rationale; usable as negative tests.)_

- **14.1 No arbitrary emission.** ArosCoin cannot be emitted outside a confirmed process — by anyone (node, operator, administrator), by decision, schedule, or external instruction. Every emitted unit must have a cause: a specific process that passed PoT (P1, P5). Emission is triggered only by the emission engine on PoT confirmation; any attempt without a confirmed-process binding is rejected and not recorded as valid state. Excludes inflation-at-will, hidden over-issuance, and emission for non-existent activity.
- **14.2 No fictitious volume.** Artificial inflation of confirmed volume (PoT_volume) is forbidden — empty, looping, or mutually-cancelling operations to grow metrics (reserveIndex, AST Strength) or node payment. Only a real executed economic action counts as confirmed; PoT verifies the fact of execution, not its outward form. Operations without real economic content fail validation and do not feed value or metrics. Protects capitalization from inflation and node payment from rewarding empty work.
- **14.3 No external interference in PoT.** PoT logic cannot be changed, overridden, or bypassed from outside. No calling system, node, or administrator may substitute the confirmation criterion, prematurely declare completion, or force confirmation of non-execution. PoT is a closed internal mechanism: an external interface may request execution but not govern validation (Ch. XV). Guarantees value only from genuinely proven execution; closes the path to forged confirmations.
- **14.4 Circulation limit before Release Phase.** Before maturity (Ch. XII) ArosCoin does not enter a free external market and exists only in internal roles — process unit and payment accounting unit (5.1–5.2). Any attempt to push process value into free circulation before Release Phase activation is architecturally blocked. Prevents turning an immature process unit into a speculative instrument; preserves value's link to real work (P7).
- **14.5 No unauthorized mint/burn.** Mint and burn are allowed only as deterministic steps of a confirmed process: mint at start of a verified process, burn at cycle completion (process part). Any mint or burn outside this logic — by request, manually, by external call — is forbidden and impossible. Closes channels of hidden issuance and arbitrary withdrawal; makes total supply strictly derivable from NodeChain process history.
- **14.6 No staking, farming, or token-weighted governance.** Locking tokens for yield (staking), accruing for mere holding (farming), or gaining a governing vote proportional to token count (token-weighted governance) are excluded — they credit value for possession, not work, contradicting "payment for execution, not reward for participation" (P2, P6). A node's influence comes from its executed work and reputation (8.3–8.4), not from a held balance. Keeps AST an economy of labor, not capital.

---

## XV. External Calls & Integration
_(Replaces the "AFC integration" chapter — AST is treated standalone.)_

- **15.1 External call.** AST may be called from outside (institutional systems, API contracts) to execute a process. A call is a request to execute, not governance.
- **15.2 No governance interference.** External systems do not govern AST, do not change its rules, emission, or PoT. AST remains sovereign (1.5).
- **15.3 Result return.** On completion AST returns the confirmed state (fixed in NodeChain) to the caller.
- **15.4 Interface compatibility.** Standardized call interface; compatible with banking and EVM interfaces without depending on them.

---

## XVI. System Stability Metrics

- **16.1 Reserve Index:** `reserveIndex = log10(1 + totalProcessVolume)` — logarithmic capitalization through labor.
- **16.2 Velocity Index:** `velocity = processVolume_24h / circulatingSupply` — circulation activity.
- **16.3 AST Strength:** `strength = f(totalProcessVolume, verifiedTxCount, institutionalVolume)` — aggregate maturity/robustness.
- **16.4 Confirmed settlement volume:** aggregate of large institutional operations reinforcing reserveIndex. `[ZONE: originally "via AFC" — reframe as external institutional operations without AFC binding.]`
- **16.5 System triggers:** thresholds for Release Phase, dynamic fee, load rebalancing.

---

## XVII. Architectural Evolution

- **17.1 Protocol updates** — controlled, deterministic.
- **17.2 Version management** — semantic versioning of ontology and engines.
- **17.3 Backward compatibility** — old states stay valid and reconstructable.
- **17.4 Change control** — rule changes via a fixed procedure, not arbitrary.

---

## Appendix A. Implementation Modules

```yaml
modules:
  proof_of_transaction_engine: PoT validation
  tokenomics_service:          ArosCoin emission/accounting
  nodechain_engine:            state processing & registration
  settlement_controller:       commission pool & distribution
  release_daemon:              Release Phase activation
  velocity_tracker:            velocity computation
  node_reputation_service:     node reputation/weight
  resource_monitor:            operation resource/energy cost
  ledger:                      append-only state journal
```

## Appendix B. Data Entities (schema)

```yaml
Transaction:        # ledger
  {id, hash, previousHash, sender, recipient, amount, type, verified, ledgerHeight}
NodeEntity:         # nodechain
  {id, type, metrics{uptime, successes}, status, weight, reputation}
ExecutionSnapshot:  # nodechain
  {sequenceId, hash, prevHash, validatorId, status}
SupplySnapshot:     # tokenomics
  {processMinted, processBurned, earnedRetained, timestamp}
  # [ZONE: Model-1 fields — "earnedRetained" instead of custodial circulatingSupply]
EpochEntity:        # settlement
  {epochNumber, startTime, endTime, totalFees, distributionLog, status}
```

## Appendix C. Data Flows (Model 1, cleaned of Model A)

```yaml
emission_execution_burn_pay:
  - initiation
  - PoT check
  - emit process part
  - node execution
  - state recording
  - payment distribution from pool
  - burn process part
  - metric update
payment_epoch:
  - epoch start
  - fee accrual
  - finalization
  - node weight computation (PoT)
  - payment distribution
  - archive DistributionLog
zones:
  - "[ZONE] flows 'Fiat Ingress (Deposit->Mint)' and 'Fiat Egress (Burn->Withdrawal)' from doc #3 are Model A; excluded in standalone-AST"
```

## Appendix D. Formulas (full list — separate doc "AST Formulas")

```yaml
PoT_volume:            "sum(tx.amount * tx.verified)"
reserveIndex:          "log10(1 + totalProcessVolume)"
ArosCoin_internalPrice:"base * reserveIndex"
fee:                   "tx.amount * feeRate"
paymentToNode:         "(node_weight * tx.fee) / sum(weights)"
velocity:              "processVolume_24h / circulatingSupply"
release_condition:     "reserveIndex > threshold AND velocity > target"
strength:              "f(totalProcessVolume, verifiedTxCount, institutionalVolume)"
nodeReputation:        "sum(success)/sum(total) * uptimeFactor"
dynamicFee:            "fee * (1 + overloadRate)"
epochWeight:           "baseWeight * decayFactor"
processEnergy:         "computeTime * nodeCount * dataSize"
```

## Appendix E. Invariants

```yaml
- I1: "value arises only when tx.verified == 1 (PoT)"
- I2: "every emission bound to a confirmed process (no premine / free emission)"
- I3: "every significant event recorded in NodeChain (else invalid)"
- I4: "determinism: same input -> same result"
- I5: "earned is retained; speculative hold / farming / staking forbidden"
- I6: "keys and data bound to jurisdiction"
- I7: "ArosCoin circulation bounded until Release Phase"
```

## Appendix F. Ontological Principles (summary)

```yaml
value_arises_from:   confirmed process of value-exchange
work_recorded_via:   NodeChain + PoT
payment:             post-factum only, for executed work
ArosCoin:            earned and retained; speculation forbidden
reserve:             AST own capitalization from confirmed work
confirmation:        mathematically provable (rule-checked, not power/stake consensus)
AST_as_subject:      independent legal entity, licensed token-economy
circulation:         bounded until Release Phase
```
