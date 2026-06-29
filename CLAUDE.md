# AST — Claude Code Project Canon (Model 1)

You are working on **AST (Aros Studio Tokenomics)**. Your job: port the **Model‑1 reference core**
into this NestJS repository as production services, strictly per the Model‑1 canon, and remove all
Model‑A remnants. Read `AST_RULES.yaml` (hard rules) and `AST_AGENT_TASKS.yaml` (your task) before coding.

## Source-of-truth authority (highest first)
1. **Model‑1 agent specs** — `docs/specs/AST_*_AGENT_EN.md` (per-entity) and `AST_Ontology_FULL_AGENT_EN.md`.
2. **Reference implementation** — `reference/ast-core/` (runnable Model‑1 core; behavior is correct by construction).
3. This `CLAUDE.md` and `AST_RULES.yaml`.
> The Notion project and the existing repo code are **Model‑A, historical**. They are NOT authoritative.
> Where existing code disagrees with the specs, the specs win.

## What you are building (Model 1)
The full process lifecycle: initiation → admissibility → node assignment → execution →
**PoT verify** → **emission (mint)** → fee accrual → reserve update → **burn process part** →
final record; **All‑Seeing Eye observes passively** throughout; commission paid **post‑factum** per epoch.

## Entities → modules (one NestJS module each)
NodeChain · StateRecording · PoT · ArosCoin · Emission · Commission · Reserve · Release · Nodes · AllSeeingEye · ProcessOrchestrator.
Each maps 1:1 to a spec in `docs/specs/` and a module in `reference/ast-core/src/`.

## Hard rules (never violate — see AST_RULES.yaml for the testable list)
- **Emission only on PoT‑verified processes.** No mint/burn outside confirmed-process logic.
- **No staking, no slashing-against-balance, no token‑weighted governance, no farming.** Node influence = work + reputation.
- **No mint-on-deposit / crypto→ArosCoin custodial conversion** (that is Model A).
- **All‑Seeing Eye is passive**: observe → log → compare → signal. It must never change state, halt, vote, or enforce.
- **Append‑only NodeChain**; every significant event recorded; deterministic execution.
- **Positive definitions only** in code comments/docs: describe what a thing IS and does, not what it is not.
- Earned value is **retained**; process part is **burned**. `totalSupply` derivable from history.

## Model‑A → Model‑1 migration
- **REMOVE/disable:** validator staking, stake freeze/unlock, slashing & penalty-vs-stake, staking governance interface,
  crypto_to_aroscoin_conversion, mint-on-deposit bridge custody, token-weighted voting.
- **KEEP & align:** Emission Layer (PoT‑gated), PoT engine core, TX/NodeChain recording, All‑Seeing Eye.
- **REWRITE:** node incentives → reputation/weight payment (no stake); governance → role-based (not token-weighted);
  AI agents → passive observation aligned with the Eye.

## Definition of done (every task)
1. Module compiles and is wired into the Nest app.
2. The relevant **invariants in `AST_RULES.yaml` pass as automated tests**.
3. No prohibited construct is present (grep gates in AST_RULES.yaml).
4. Public API documented; positive-language comments.

## Conventions
NestJS + TypeScript, modular (`src/<module>/`), TypeORM + PostgreSQL for persistence, Jest for tests,
DTO validation via `ValidationPipe`. Keep each module's public surface aligned to its agent spec's `operations`.
