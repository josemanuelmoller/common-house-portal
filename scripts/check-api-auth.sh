#!/usr/bin/env bash
# CI gate: every mutating route under src/app/api must INVOKE an auth helper
# (adminGuardApi, requireCronAuth, isValidCronRequest, currentUser, or
# requireSameOriginRequest) OR be on the documented public allowlist.
#
# Wave 5 H1: the previous version did a substring grep that matched comments
# and stale references. Now we strip line/block comments first, then look for
# an actual function-call pattern (`name(`).

set -e

# Routes explicitly intended to be public (no auth). Document any addition in
# docs/ROUTES_AND_SURFACES.md and docs/SECURITY_MODEL.md.
PUBLIC_ALLOWLIST=(
  "src/app/api/hall-data/route.ts"
  "src/app/api/living-room/people/route.ts"
  "src/app/api/living-room/milestones/route.ts"
  "src/app/api/living-room/signals/route.ts"
  "src/app/api/living-room/themes/route.ts"
)

# Auth helper patterns. Each entry is a function name; we look for `name(` in
# the comment-stripped source. We ALSO accept the secret-name constants since
# routes that compare against them inline are doing auth work too.
HELPER_CALLS=(
  "adminGuardApi"
  "requireCronAuth"
  "isValidCronRequest"
  "currentUser"
  "requireAdminAction"
  "requireAdmin"
  "requireSameOriginRequest"
  "requireNavigationOrSameOrigin"
)

# Env-var auth markers (legacy inline-style routes still using these are OK).
HELPER_ENV=(
  "process.env.CRON_SECRET"
  "process.env.AGENT_API_KEY"
  "process.env.CLIPPER_TOKEN"
)

is_allowlisted() {
  local f="$1"
  for a in "${PUBLIC_ALLOWLIST[@]}"; do
    if [ "$f" = "$a" ]; then return 0; fi
  done
  return 1
}

# Files reachable as /api/*
mapfile -t ROUTES < <(find src/app/api -name route.ts -type f 2>/dev/null | sort)

VIOLATIONS=0
for f in "${ROUTES[@]}"; do
  # Skip if file does not export a mutating verb.
  if ! grep -qE "^export (async )?function (POST|PATCH|PUT|DELETE)\b|^export const (POST|PATCH|PUT|DELETE)\b" "$f"; then
    continue
  fi
  if is_allowlisted "$f"; then continue; fi

  # Strip comments before searching, so a stale `// adminGuardApi()` mention
  # doesn't satisfy the gate.
  #   - Block comments /* ... */
  #   - Line comments  // ...
  STRIPPED=$(python3 -c "
import re, sys
src = open(sys.argv[1], 'r', encoding='utf-8').read()
# Remove block comments
src = re.sub(r'/\*[\s\S]*?\*/', '', src)
# Remove line comments
src = re.sub(r'//[^\n]*', '', src)
sys.stdout.write(src)
" "$f" 2>/dev/null || cat "$f")

  FOUND=0
  # Look for actual function-call pattern: HELPER_NAME(
  for h in "${HELPER_CALLS[@]}"; do
    if echo "$STRIPPED" | grep -qE "\b${h}\("; then
      FOUND=1
      break
    fi
  done

  # Fallback: env-var inline auth (legacy pattern, still valid).
  if [ "$FOUND" -eq 0 ]; then
    for envvar in "${HELPER_ENV[@]}"; do
      if echo "$STRIPPED" | grep -qF "$envvar"; then
        FOUND=1
        break
      fi
    done
  fi

  if [ "$FOUND" -eq 0 ]; then
    echo "❌ $f — mutating route with no auth helper CALL detected (post-comment-strip)."
    VIOLATIONS=$((VIOLATIONS+1))
  fi
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "[check-api-auth] $VIOLATIONS route(s) appear to lack an auth-helper call."
  echo "Comments and stale imports no longer satisfy the gate (Wave 5 H1)."
  echo "Add an actual function call: adminGuardApi() / requireCronAuth(req) / etc.,"
  echo "or add the path to PUBLIC_ALLOWLIST and document in docs/SECURITY_MODEL.md."
  exit 1
fi

echo "[check-api-auth] OK — ${#ROUTES[@]} routes scanned, all guarded."
exit 0
