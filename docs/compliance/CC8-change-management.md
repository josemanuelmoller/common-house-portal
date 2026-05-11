# CC8 — Change Management

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

## Scope

How code, infrastructure, and configuration changes reach production
without introducing security regressions.

## Control statement

Every change to production is reviewed (by founder or AI agent under
founder authorisation), gated by automated security checks, and traceable
to a commit on `main`.

## Workflow

1. **Branch:** `git checkout -b claude/<topic>` or `feat/<topic>`.
2. **Edit + commit:** locally; pre-commit hook runs `scripts/check-secrets.sh`.
3. **PR to `main`:** GitHub Actions `security-gates` workflow runs:
   - `check-secrets` — pattern scan of changed files
   - `check-api-auth` — every mutating /api route references an auth helper
   - `check-no-err-leak` — no new `err.message` echoes to clients
   - `npm-audit` — fails on new high/critical CVE over baseline
   - `typecheck` — `tsc --noEmit`
4. **Review:** founder approves PR.
5. **Merge to `main`:** triggers Vercel production deploy.
6. **Verification:** founder loads `portal.wearecommonhouse.com` and
   confirms the change. See AGENTS.md "Runtime verification — production
   requirement (hard rule)".

## Emergency change

Rare, requires explicit founder authorisation in commit message:

```
emergency: <root cause>
authorised-by: jose
```

Still runs all CI gates. No bypass mechanism exists. If a gate is wrong,
fix the gate.

## Database migrations

- All schema changes via `supabase/migrations/*.sql` files in this repo.
- Naming convention: `YYYYMMDDHHMM_descriptive_name.sql`.
- Applied via `mcp__c3dec2a0-...__apply_migration` (Supabase MCP, scoped
  to `commonhouse` project).
- Migrations are NEVER deleted after applying — they are the audit trail
  for schema state.

## Configuration changes (Vercel env vars)

- Updated via Vercel CLI: `vercel env add <NAME> production`.
- Values piped with `printf "%s"` to avoid trailing newline corruption.
- Production env changes logged in `docs/SECURITY_MODEL.md` rotation log.

## Honest gaps

- Single-reviewer model (founder reviews own PRs). Mitigation: AI agents
  (Claude in this repo) act as adversarial reviewer when prompted; CI
  gates enforce non-negotiable rules; security findings reviewed by
  external researchers via responsible-disclosure program.
- No formal staging environment (Vercel preview deploys = staging).

## Evidence

- `.github/workflows/security-gates.yml` — 5 CI gates.
- `.husky/pre-commit` — local guard.
- `scripts/check-*.sh` — guard implementations.
- `supabase/migrations/` — schema history.

## Next review

2026-08-11.
