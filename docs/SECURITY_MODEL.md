# Common House Portal — Security Model

Last updated: Wave 4 (2026-05-11)

This document is the canonical statement of the portal's trust boundaries,
secret blast radius, and CI gates. Read this when:
- onboarding to the codebase (after `AGENTS.md`)
- considering whether a new env var, route, or component is safe
- responding to a security incident

## 1. Identities

| Identity | What it is | Source of truth |
|---|---|---|
| **Visitor** | Anyone hitting `portal.wearecommonhouse.com` without a session | none |
| **Authenticated user** | Has a valid Clerk session cookie | Clerk |
| **Admin** | `userId` in `ADMIN_USER_IDS` OR `email` in `ADMIN_EMAILS` env | Clerk + env |
| **Super-admin** | `userId` in `SUPER_ADMIN_USER_IDS` OR `email` in `SUPER_ADMIN_EMAILS` env | Clerk + env |
| **Cron / agent** | Bearer matches `CRON_SECRET` (or legacy `AGENT_API_KEY`) header | env |
| **Chrome clipper** | Bearer matches `CLIPPER_TOKEN`; CORS-locked to extension origin | env |
| **Service-role Supabase** | `SUPABASE_SERVICE_KEY` — server only, bypasses RLS | env |

Super-admin gate: when `SUPER_ADMIN_USER_IDS` / `SUPER_ADMIN_EMAILS` are empty,
the gate fails closed in production. Dev/preview falls back to admin for ease
of local work. See `src/lib/clients.ts`.

## 2. Trust boundaries

```
                ┌────────────────────────────────────────────┐
                │  Visitor / authenticated user              │
                │  (browser, mobile, RSS, Chrome clipper)    │
                └─────────────────┬──────────────────────────┘
                                  │ HTTPS only (HSTS preload)
                                  ▼
        ┌─────────────────────────────────────────────────────┐
        │  Vercel edge — global headers, CDN caching          │
        │  Wave 2.1: CSP, HSTS, X-Frame-Options, etc.         │
        └─────────────────┬──────────────┬────────────────────┘
                          │              │
                          ▼              ▼
                 /admin/* /hall/*   /api/*
                          │              │
                          │              │  middleware marks /api/* PUBLIC
                          │              │  → every route reauths locally
                          │              ▼
                 Clerk session    adminGuardApi / requireCronAuth
                          │       / requireSameOriginRequest / clipper bearer
                          │              │
                          └──────┬───────┘
                                 ▼
                   ┌─────────────────────────────┐
                   │ Supabase + Notion + Google  │
                   │ Anthropic + Fireflies       │
                   └─────────────────────────────┘
```

Key invariant: the middleware (`src/middleware.ts`) deliberately lists
`/api/(.*)` as public so admin/cron flows can run server-to-server without
Clerk cookie. Every `/api/**/route.ts` MUST therefore call an auth helper.
The CI gate `scripts/check-api-auth.sh` enforces this.

## 3. Secret blast radius

| Secret | Where stored | Blast if leaked | Rotation playbook |
|---|---|---|---|
| `CLERK_SECRET_KEY` | Vercel env | Full admin impersonation; session forge | https://dashboard.clerk.com → API Keys → Regenerate |
| `CLERK_PUBLISHABLE_KEY` (`NEXT_PUBLIC_*`) | Vercel env (shipped to browser) | None on its own (designed-public) | Same as above |
| `NOTION_API_KEY` | Vercel env | Full r/w on all CH Notion DBs | https://www.notion.so/profile/integrations → cote-os → Rotate (offers 7-day grace) |
| `SUPABASE_SERVICE_KEY` | Vercel env | Full r/w on every Supabase table, bypasses RLS | https://app.supabase.com → project → Settings → API → Reset service role key |
| `SUPABASE_ANON_KEY` | Vercel env | Limited by RLS (no policies = denied) | Same as above |
| `ANTHROPIC_API_KEY` | Vercel env | Budget drain; no data access | https://console.anthropic.com → API Keys |
| `GMAIL_REFRESH_TOKEN` | Vercel env | Read + send mail as `josemanuel@wearecommonhouse.com` | https://myaccount.google.com/permissions → revoke + re-grant via /api/google/auth |
| `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` | Vercel env | New tokens can be minted if also stolen | Google Cloud Console → OAuth credentials |
| `CRON_SECRET` | Vercel env | Trigger any cron route; write to Supabase via clipper/ingest paths | Generate new (`openssl rand -hex 32`), update env, redeploy |
| `AGENT_API_KEY` | Vercel env | Trigger `/api/agent-run` + `/api/ingest-meetings` | Same |
| `CLIPPER_TOKEN` | Vercel env + Chrome extension storage | Append arbitrary entries to `sources`/`people`/`conversation_messages` via /api/clipper | Generate new, update Vercel + each user's clipper Options |
| `VAPID_PRIVATE_KEY` | Vercel env | Forge push notifications to subscribed devices | Generate new VAPID keypair, push subscribers will re-register on next visit |
| `FIREFLIES_API_KEY` | Vercel env | Read all Fireflies transcripts in the workspace | Fireflies dashboard → API |

If any of these is leaked, **rotate immediately** before doing anything else.
After rotation:
1. Audit Vercel deploys triggered with the old secret since rotation time
2. Audit Supabase access logs (Settings → API → Logs) for anomalies
3. Audit Notion audit log (Workspace settings → Audit log)

## 4. CI gates (Wave 4)

Located in `.github/workflows/security-gates.yml`:

| Gate | What it does | When it runs |
|---|---|---|
| `check-secrets` | Pattern-scans new/changed files for `ntn_*`, `sk_live_*`, `sk-ant-*`, `AIza*`, JWTs, PEM keys, and known historical literals (`ch-os-agent-2024-secure`, `ch-agents-2026`). | every PR + push to main |
| `check-api-auth` | Every `src/app/api/**/route.ts` that exports POST/PATCH/PUT/DELETE must reference one of `adminGuardApi`, `requireCronAuth`, `isValidCronRequest`, `currentUser`, `requireAdminAction`, `requireSameOriginRequest`, or a known shared-secret header. Public allowlist is in `scripts/check-api-auth.sh`. | every PR + push to main |
| `npm-audit` | Fails when `npm audit` reports more high/critical vulnerabilities than the documented baseline (5 high transitive in `d3-color`/`postcss` as of Wave 3). | every PR + push to main |
| `typecheck` | `tsc --noEmit` clean. | every PR + push to main |

Pre-commit hook: `.husky/pre-commit` runs `scripts/check-secrets.sh` against the
staged diff. Bypass with `SKIP_SECRET_SCAN=1 git commit` only when whitelisting
a doc placeholder.

## 5. Public-by-design routes

Documented exceptions to the "every `/api/*` is gated" rule:

| Route | Method | Why public |
|---|---|---|
| `/api/hall-data` | GET | Public-facing Hall surface. Reads only — no mutation. Returns project names, decision titles, agent statuses. CDN cached 3 min. |
| `/api/living-room/people` | GET | Read-only community module render data |
| `/api/living-room/milestones` | GET | Read-only |
| `/api/living-room/signals` | GET | Read-only |
| `/api/living-room/themes` | GET | Read-only |

Any addition here must:
1. Be added to `PUBLIC_ALLOWLIST` in `scripts/check-api-auth.sh`
2. Be read-only (no mutation)
3. Have its data exposure surface reviewed (see ‎Wave 4 audit notes in PR #N)
4. Be documented here

## 6. Defense-in-depth boundaries

- **`import "server-only"`** on `src/lib/{notion/core,supabase,supabase-server,drive,google-auth,plan,hall-compose}.ts`. Client-safe types live in `*-shared.ts` siblings (`plan-shared.ts`, `hall-compose-shared.ts`). Forgetting this and importing the server lib from a client component fails the build.
- **RLS** on every public table in Supabase. `anon` and `authenticated` roles have explicit `REVOKE` (Wave 2.5 migration `20260511120000_rls_defense_in_depth.sql`). `service_role` bypasses RLS and is the only role with write access via API routes.
- **CSRF**: `requireSameOriginRequest()` on every multipart upload route. JSON routes are protected by the implicit CORS preflight (browsers refuse to send a Clerk cookie cross-origin when the Content-Type triggers preflight and the server doesn't ACAO the attacker's origin).
- **SSRF**: `safeFetch()` on every route that fetches an admin-supplied URL. Blocks loopback, RFC1918, 169.254.169.254 (cloud metadata), non-http(s).
- **Storage paths**: admin-supplied `storagePath` and `projectId` are validated against shape regexes / prefix allowlists before being interpolated into bucket paths. See `src/app/api/garage-upload/finalize/route.ts`.
- **Zip-bomb guard**: `extractPptxText` caps decompressed size at 75 MB / 50 MB per entry / 5000 entries.

## 7. Known accepted risks

- **5 high CVEs in `d3-color`** via `react-simple-maps`: ReDoS in color parsing. Triggered only by attacker-controlled color strings; the app never reads color from user input. Tracked for `react-simple-maps@4` upgrade when stable releases.
- **`postcss` compile-time XSS** via Next 16.2.3: only triggers if user-controlled CSS is fed through PostCSS, which the app does not do.
- **Single-region Vercel deploy** (`lhr1`): availability-only concern, no security impact.

## 8. Incident response

1. **Confirm**: reproduce the issue. Take screenshots, save curl output.
2. **Contain**: rotate any relevant secret per §3. If a route is being abused, deploy a 410-Gone wrapper.
3. **Audit**: pull Vercel function logs, Supabase audit, Notion audit log.
4. **Communicate**: notify the founder (josemanuelmoller@gmail.com) immediately, even if the incident appears self-contained.
5. **Post-mortem**: write a `docs/postmortems/YYYY-MM-DD-name.md`. Mention which CI gate would have caught this; add it if missing.

## 9. Audit history

| Wave | Date | PR | Summary |
|---|---|---|---|
| Audit | 2026-05-10 | — | External-attacker code-only audit. 47 findings: 8 critical, 11 high, 14 medium, ~14 low. |
| Wave 0 | 2026-05-10 | — | Operational rotations: Notion token, AGENT_API_KEY, CRON_SECRET. |
| Wave 1 | 2026-05-10 | [#8](https://github.com/josemanuelmoller/common-house-portal/pull/8) | Critical fixes: JWT bypass, backdoor removal, empty-secret guard, XSS escapes, xlsx CVE, Clerk CVE. |
| Wave 2 | 2026-05-11 | [#9](https://github.com/josemanuelmoller/common-house-portal/pull/9) | Headers/CSP, SSRF, CSRF, storage path, RLS defense-in-depth, OAuth diagnostic gating. |
| Wave 3 | 2026-05-11 | [#10](https://github.com/josemanuelmoller/common-house-portal/pull/10) | server-only on libs, fallback observability, zip-bomb guard, chrome ext, super-admin gate, route cleanup. |
| Wave 4 | 2026-05-11 | (this PR) | Process hardening: plan/hall-compose split, ESLint rule, pre-commit hook, dependabot, CI gates, this doc. |
