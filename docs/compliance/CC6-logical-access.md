# CC6 — Logical and Physical Access Controls

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

## Scope

How CH restricts access to the production portal, code, and underlying
data stores (Supabase, Notion, Clerk, Anthropic, Vercel, Google).

## Control statement

Access to production systems is restricted to authorised personnel,
authenticated with strong factors, scoped to the minimum required, and
revocable on demand.

## Authentication

| System | Method | MFA | Reviewed |
|---|---|---|---|
| Clerk (portal) | Email + Google OAuth | Required for `josemanuelmoller@gmail.com` (passkey + TOTP backup) | Monthly |
| Supabase | Google SSO via dashboard | Account-level MFA in Google | Monthly |
| Vercel | Google SSO | Account-level MFA in Google | Monthly |
| GitHub | Username + WebAuthn passkey | Yes | Monthly |
| Notion | Google SSO | Account-level MFA in Google | Monthly |
| Anthropic Console | Email + TOTP | Yes | Monthly |
| Google Workspace (root) | Hardware-equivalent (passkey) + Advanced Protection enrolled | Yes | Quarterly |

## Authorisation (least privilege)

- **API routes:** every mutating route under `src/app/api/` must call
  `adminGuardApi()` (`src/lib/require-admin.ts`) or check `CRON_SECRET`
  bearer. Enforced by `.github/workflows/security-gates.yml` →
  `check-api-auth` job.
- **Supabase RLS:** Service-role keys only used server-side (verified by
  `import "server-only"` in `src/lib/supabase.ts`). Anon role grants
  revoked on every table by migration
  `supabase/migrations/20260511120000_rls_defense_in_depth.sql` and views
  `20260511140000_rls_defense_views.sql`.
- **Cron / agent routes:** Require `Authorization: Bearer <CRON_SECRET>`
  or `x-agent-key` header. Fail-closed on empty env. Enforced by
  `src/lib/require-cron.ts`.
- **Notion:** Integration token scoped to the CH workspace only. No public
  page sharing.
- **Anthropic:** Single API key, server-side only. Never exposed to
  clients.

## Secret management

- All secrets stored in Vercel project env vars (production scope).
- No secrets in code, in `.env` files committed, or in npm package
  metadata. Enforced by `scripts/check-secrets.sh` (pre-commit + CI).
- Rotation cadence and log: `docs/SECURITY_MODEL.md` § "Secret rotation
  log".

## Termination / offboarding

Single-owner today. When CH adds a second person, offboarding runbook:
1. Revoke Clerk session + delete user.
2. Remove from Vercel team.
3. Remove from GitHub org (or downgrade to outside collaborator).
4. Remove from Google Workspace.
5. Remove from Supabase dashboard team.
6. Rotate `CRON_SECRET`, `CLERK_SECRET_KEY` (rotate, not just revoke).
7. Document in `docs/SECURITY_MODEL.md` rotation log.

## Honest gaps

- No SSO across all vendor systems (mixed Google OAuth + native logins).
  Mitigation: every system uses the founder's Google account as auth
  factor; rotation of that Google account propagates.
- No formal "joiner-mover-leaver" workflow (N/A while single-owner).

## Evidence

- `src/middleware.ts` — Clerk middleware config.
- `src/lib/require-admin.ts` — admin guard.
- `src/lib/require-cron.ts` — cron guard.
- `src/lib/supabase.ts` — `import "server-only"` boundary.
- `supabase/migrations/20260511*.sql` — RLS defense-in-depth.
- `scripts/check-secrets.sh`, `scripts/check-api-auth.sh` — automated
  enforcement.

## Next review

2026-08-11.
