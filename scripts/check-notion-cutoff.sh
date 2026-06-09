#!/usr/bin/env bash
# scripts/check-notion-cutoff.sh
#
# Pre-commit / pre-push guard for the Notion deprecation cutoff
# (2026-06-02). See docs/SUPABASE_CONSOLIDATION_FREEZE.md.
#
# Fails (exit 1) if the count of active Notion write call sites in
# src/ has GONE UP versus the previous commit. Going DOWN is fine.
# Holding steady is fine. Going up is the failure mode this guard
# catches.
#
# A call site is considered "active" if it is a non-commented line
# matching one of:
#   notion.pages.create
#   notion.pages.update
#   notion.databases.update
#   notion.blocks.children.append
#
# Lines preceded by a `// notion-cutoff-2026-06-02:` marker comment
# are intentional removals and counted as inactive.
#
# Run manually:
#   bash scripts/check-notion-cutoff.sh
#
# Wire into pre-commit (optional, recommended):
#   echo 'bash scripts/check-notion-cutoff.sh' >> .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

set -euo pipefail

PATTERN='await\s+notion\.(pages\.(create|update)|databases\.update|blocks\.children\.append)'

count_active() {
  local ref="$1"
  # `|| true` keeps pipefail from blowing up the script when there are 0
  # matches (the desired end state at cutoff): grep exits 1 on no matches,
  # which under `set -o pipefail` was killing the count and exiting 1.
  if [ -z "$ref" ]; then
    { grep -rEh "$PATTERN" src/app src/lib src/components 2>/dev/null || true; } \
      | { grep -vE '^\s*//' || true; } \
      | { grep -vE 'notion-cutoff-(2026-06-02|exempt)' || true; } \
      | wc -l \
      | tr -d ' '
  else
    { git grep -hE "$PATTERN" "$ref" -- src/app src/lib src/components 2>/dev/null || true; } \
      | { grep -vE '^\s*//' || true; } \
      | { grep -vE 'notion-cutoff-(2026-06-02|exempt)' || true; } \
      | wc -l \
      | tr -d ' '
  fi
}

current=$(count_active "")
baseline=$(count_active "HEAD" 2>/dev/null || echo 0)

echo "Notion write call sites — baseline (HEAD): ${baseline}, working tree: ${current}"

if [ "${current}" -gt "${baseline}" ]; then
  cat <<EOF >&2

  ✗ Notion deprecation guard FAILED.

  The number of active Notion write call sites in src/ has increased
  from ${baseline} to ${current} in your changes.

  This violates the freeze decision recorded in
  docs/SUPABASE_CONSOLIDATION_FREEZE.md (cutoff 2026-06-02).

  Possible fixes:
    1. Move the new write to a canonical Supabase table per §3 of the
       freeze doc.
    2. If the new write is genuinely required and has no Supabase
       equivalent, mark it with a comment:
         // notion-cutoff-exempt: <one-line reason>
       on the line ABOVE the notion call. The owner must approve the
       exemption in review.

  See docs/migration/REJECTED_PATTERNS.md for the patterns that have
  already been considered and rejected.
EOF
  exit 1
fi

if [ "${current}" -lt "${baseline}" ]; then
  echo "  ✓ Active call sites went down by $((baseline - current)). Good progress toward cutoff."
else
  echo "  ✓ Active call sites unchanged."
fi
