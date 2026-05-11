#!/usr/bin/env bash
# CI gate: every new mutating route under src/app/api must reference an auth
# helper (adminGuardApi, requireCronAuth, isValidCronRequest, currentUser, or
# requireSameOriginRequest) OR be on the documented public allowlist.
#
# Catches the failure mode the audit found: a /api/** route shipped without
# any auth check because src/middleware.ts marks /api/* as public.
#
# Run via:  bash scripts/check-api-auth.sh

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
  # Skip if file does not export a mutating verb (POST/PATCH/PUT/DELETE).
  if ! grep -qE "export (async )?function (POST|PATCH|PUT|DELETE)\b|export const (POST|PATCH|PUT|DELETE)\b" "$f"; then
    continue
  fi
  if is_allowlisted "$f"; then continue; fi

  # Look for at least one auth helper reference.
  if grep -qE "adminGuardApi|requireCronAuth|isValidCronRequest|currentUser|requireAdminAction|requireSameOriginRequest|x-agent-key|CRON_SECRET|AGENT_API_KEY|CLIPPER_TOKEN" "$f"; then
    continue
  fi

  echo "❌ $f — mutating route with no auth helper reference."
  VIOLATIONS=$((VIOLATIONS+1))
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "[check-api-auth] $VIOLATIONS route(s) appear to lack auth."
  echo "Add adminGuardApi() / requireCronAuth() / requireSameOriginRequest(),"
  echo "or add the path to PUBLIC_ALLOWLIST in scripts/check-api-auth.sh AND"
  echo "document it in docs/ROUTES_AND_SURFACES.md and docs/SECURITY_MODEL.md."
  exit 1
fi

echo "[check-api-auth] OK — ${#ROUTES[@]} routes scanned, all guarded."
exit 0
