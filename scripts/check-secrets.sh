#!/usr/bin/env bash
# Pre-commit / CI guard: scan staged files for likely secret patterns.
#
# Triggers on:
#   - Notion integration tokens         ntn_[A-Za-z0-9]{30,}
#   - Clerk live keys                   sk_live_..., pk_live_...
#   - Clerk test keys                   sk_test_..., pk_test_... (should be env-only)
#   - Anthropic keys                    sk-ant-[A-Za-z0-9-]{20,}
#   - Google API keys                   AIza[A-Za-z0-9_-]{30,}
#   - Google OAuth refresh tokens       1//[A-Za-z0-9_-]{30,}
#   - Google access tokens              ya29\.[A-Za-z0-9._-]{30,}
#   - JWTs (3-part base64url + dot)     eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}
#   - PEM private keys                  -----BEGIN [A-Z ]+PRIVATE KEY-----
#   - Generic high-entropy bearer-like  Bearer [A-Za-z0-9._-]{30,}
#   - The historical CH backdoor        ch-os-agent-2024-secure
#   - The historical CH agent literal   ch-agents-2026 (post-rotation)
#
# Exits 1 if any match is found in staged content (or in supplied paths).

set -e

if [ -n "${SKIP_SECRET_SCAN:-}" ]; then
  echo "[check-secrets] SKIP_SECRET_SCAN set — skipping."
  exit 0
fi

# Decide what to scan: staged diff in a hook context, or argv list in CI mode.
if [ $# -gt 0 ]; then
  TARGETS=("$@")
  SCAN_MODE="paths"
else
  # Staged files added or modified, excluding deletions.
  mapfile -t TARGETS < <(git diff --cached --name-only --diff-filter=ACMR)
  SCAN_MODE="staged"
fi

if [ ${#TARGETS[@]} -eq 0 ]; then
  exit 0
fi

PATTERNS=(
  'ntn_[A-Za-z0-9]{30,}'
  'sk_live_[A-Za-z0-9_-]{20,}'
  'pk_live_[A-Za-z0-9_-]{20,}'
  'sk_test_[A-Za-z0-9_-]{20,}'
  'pk_test_[A-Za-z0-9_-]{20,}'
  'sk-ant-[A-Za-z0-9_-]{20,}'
  'AIza[A-Za-z0-9_-]{30,}'
  '1//[A-Za-z0-9_-]{30,}'
  'ya29\.[A-Za-z0-9._-]{30,}'
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
  'BEGIN [A-Z ]+PRIVATE KEY'
  'Bearer [A-Za-z0-9._-]{30,}'
  'ch-os-agent-2024-secure'
  'ch-agents-2026'
)

# Files that may legitimately contain example placeholders.
SKIP=(
  '\.env\.example$'
  'scripts/check-secrets\.sh$'
  'docs/SECURITY_MODEL\.md$'
)

is_skipped() {
  local f="$1"
  for s in "${SKIP[@]}"; do
    if [[ "$f" =~ $s ]]; then return 0; fi
  done
  return 1
}

VIOLATIONS=0
for f in "${TARGETS[@]}"; do
  if is_skipped "$f"; then continue; fi
  if [ ! -f "$f" ]; then continue; fi
  for p in "${PATTERNS[@]}"; do
    if [ "$SCAN_MODE" = "staged" ]; then
      MATCH=$(git diff --cached --unified=0 -- "$f" | grep -E "^\+" | grep -E "$p" || true)
    else
      MATCH=$(grep -E "$p" "$f" || true)
    fi
    if [ -n "$MATCH" ]; then
      echo "❌ Secret-like pattern in $f (matches /$p/):"
      echo "$MATCH" | sed 's/^/    /'
      VIOLATIONS=$((VIOLATIONS+1))
    fi
  done
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "[check-secrets] Found $VIOLATIONS likely secret(s)."
  echo "If this is a false positive (test fixture, doc placeholder), either"
  echo "  - move it to an .env.example file (whitelisted)"
  echo "  - or commit with SKIP_SECRET_SCAN=1 git commit (and explain why in the message)"
  exit 1
fi

exit 0
