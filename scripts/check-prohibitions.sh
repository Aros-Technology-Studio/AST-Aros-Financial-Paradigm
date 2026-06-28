#!/usr/bin/env bash
# AST Model-1 prohibition gate (P1–P8 of AST_RULES.yaml).
#
# Greps the production source tree for Model-A constructs that must never reappear. Exits
# non-zero and prints every offending file:line when any prohibited pattern is found in
# production code; exits 0 cleanly otherwise.
#
# Scope rules (to avoid false positives on legitimate Model-1 code):
#   - scans src/ only; never reference/ (the reference core), dist/, or node_modules/.
#   - excludes test files (*.spec.ts, *.test.ts) — invariants assert ABSENCE of these
#     constructs by name, which is intended.
#   - strips single-line (//) and block-style (* ...) comment lines before matching, so
#     positive-language comments that name a forbidden construct to disclaim it do not trip
#     the gate. Identifiers in actual code are still caught.
#   - patterns are anchored (word boundaries / specific identifiers) so words like "stage",
#     "stale", "instate", "released", "mistake" never match.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/src"

# Collect production source files: src/**/*.ts excluding test files.
FILES="$(find "$SRC_DIR" -type f -name '*.ts' \
    ! -name '*.spec.ts' ! -name '*.test.ts' 2>/dev/null)"

violations=0

# scan <id> <description> <regex> [path-restriction]
# Searches the candidate files (optionally restricted to a sub-path) for <regex>, after
# stripping comment-only lines, and reports each hit.
scan() {
    pid="$1"; desc="$2"; pattern="$3"; restrict="${4:-}"

    for f in $FILES; do
        case "$f" in
            *"$restrict"*) : ;;
            *) [ -n "$restrict" ] && continue ;;
        esac
        # Strip comment lines: drop lines whose first non-space char is // or * or /*.
        # Then grep with line numbers against the surviving code lines.
        hits="$(grep -nE "$pattern" "$f" 2>/dev/null \
            | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' || true)"
        if [ -n "$hits" ]; then
            while IFS= read -r line; do
                rel="${f#"$ROOT"/}"
                echo "  [$pid] $desc -> $rel:$line"
                violations=$((violations + 1))
            done <<EOF
$hits
EOF
        fi
    done
}

echo "── AST Model-1 prohibition gate (P1–P8) ──"

# P1 — staking / stakedBalance / stake_freeze. Node influence is work + reputation only.
scan "P1" "staking / stakedBalance / stake_freeze" \
    '\bstakedBalance\b|\bstakeFreeze\b|\bstake_freeze\b|\bstaking\b|\.stake\b|\bstake\s*[:=(]'

# P2 — slashing against balance or stake.
scan "P2" "slashing against balance/stake" \
    '\bslash\b|\bslashStake\b|\bslashBalance\b|\bslashing\b'

# P3 — token-weighted governance / vote-by-token-balance.
scan "P3" "token-weighted governance" \
    '\btokenWeightedVote\b|votingPower.*balance|balance.*votingPower|voteByToken|\btokenWeightedGovernance\b'

# P4 — farming / passive yield for holding.
scan "P4" "farming / passive yield for holding" \
    '\byieldFarm\w*|\bfarming\b|\bliquidityMining\b|\bpassiveYield\b'

# P5 — mint-on-deposit / crypto_to_aroscoin custodial conversion.
scan "P5" "mint-on-deposit / crypto->ArosCoin conversion" \
    '\bmintOnDeposit\b|\bcryptoToAros\w*|\bdepositMint\b|crypto_to_aroscoin|mint_on_deposit'

# P6 — All-Seeing Eye must never halt/revert/vote/enforce/pause. Restricted to its module.
scan "P6" "Eye enforcement (halt/revert/enforce/vote/pause)" \
    '\bhalt\b|\brevert\b|\benforce\w*|\.vote\(|\bpause\(' \
    "/all-seeing-eye/"

# P7 — emission outside confirmed-process logic (manual/scheduled mint). Heuristic: a mint
# entry point declared outside the Emission module, or a scheduler decorator near a mint.
# Best-effort grep; the authoritative guard is the I1/I2 invariant tests. We flag scheduled
# mint hooks (@Cron/@Interval guarding a mint) and any recordMint caller outside emission.
scan "P7" "scheduled/manual mint outside confirmed-process logic" \
    '@Cron\(.*[Mm]int|@Interval\(.*[Mm]int|@Timeout\(.*[Mm]int|\bmanualMint\b|\bscheduledMint\b'

# P8 — defining entities by negation in comments/docs (positive language only). Best-effort,
# warn-only: report obvious "is not a / does not" phrasings but never fail the build on them.
p8_hits="$(grep -rnE '\b(is not a|are not|does not exist as a|not a token|never a)\b' \
    $FILES 2>/dev/null | grep -E '^[^:]+:[0-9]+:[[:space:]]*(//|\*)' || true)"
if [ -n "$p8_hits" ]; then
    echo "  [P8] (warn-only) possible negative-definition phrasing in comments:"
    echo "$p8_hits" | sed 's/^/      /' | head -20
fi

echo "─────────────────────────────────────────"
if [ "$violations" -gt 0 ]; then
    echo "FAIL: $violations prohibited construct(s) found in production code (P1–P7)."
    exit 1
fi
echo "OK: no prohibited Model-A construct found in production code."
exit 0
