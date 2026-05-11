#!/usr/bin/env bash
# CI gate: NEW occurrences of err.message / String(err) / detail:err echoed to
# the client are forbidden. Existing occurrences are tracked in BASELINE_FILE
# so the gate fails closed on new regressions while letting Wave 5+ migrate
# the existing tail at its own pace.
#
# Pattern (anti-pattern):
#   return NextResponse.json({ error: err.message }, ...)
#   return NextResponse.json({ error: String(err) }, ...)
#   return NextResponse.json({ ..., detail: err.message }, ...)
#
# Wave 4 introduced src/lib/api-error.ts as the right helper. New routes
# should use it; this gate prevents regression.
#
# Run via: bash scripts/check-no-err-leak.sh

set -e

# Pattern: error: ... err.message OR String(err) OR detail: ... err
PATTERN='error:.*\b(err|e)\b.*\.message|error:[[:space:]]*String\([[:space:]]*(err|e)[[:space:]]*\)|detail:[[:space:]]*(err|e)\.message|detail:[[:space:]]*String\([[:space:]]*(err|e)[[:space:]]*\)'

# Files in scope: API routes only (frontend may legitimately surface errors).
mapfile -t TARGETS < <(find src/app/api -name "*.ts" -type f 2>/dev/null | sort)

# Wave 5 baseline. These files have known err-leak patterns awaiting cleanup
# in a focused follow-up sweep. NEW additions to this list = the gate fails.
BASELINE_FILE="scripts/err-leak-baseline.txt"

declare -A BASELINE
if [ -f "$BASELINE_FILE" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] || [[ "$line" =~ ^# ]] && continue
    BASELINE["$line"]=1
  done < "$BASELINE_FILE"
fi

declare -A CURRENT
for f in "${TARGETS[@]}"; do
  if grep -qE "$PATTERN" "$f" 2>/dev/null; then
    CURRENT["$f"]=1
  fi
done

NEW_VIOLATIONS=0
for f in "${!CURRENT[@]}"; do
  if [ -z "${BASELINE[$f]:-}" ]; then
    echo "❌ NEW err.message / String(err) leak in: $f"
    grep -nE "$PATTERN" "$f" | head -3 | sed 's/^/    /'
    NEW_VIOLATIONS=$((NEW_VIOLATIONS+1))
  fi
done

FIXED=0
for f in "${!BASELINE[@]}"; do
  if [ -z "${CURRENT[$f]:-}" ]; then
    echo "✅ Fixed (remove from baseline): $f"
    FIXED=$((FIXED+1))
  fi
done

if [ "$NEW_VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "[check-no-err-leak] $NEW_VIOLATIONS NEW route(s) echoing err.message / String(err) to the client."
  echo "Use src/lib/api-error.ts → apiError(err, { route: \"[/api/foo]\" }) instead, which logs"
  echo "server-side and returns \"Internal error\" to the caller."
  exit 1
fi

echo "[check-no-err-leak] OK — ${#TARGETS[@]} routes scanned. Baseline=${#BASELINE[@]} | Current=${#CURRENT[@]} | Fixed=$FIXED"
exit 0
