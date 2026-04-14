# Common House Portal

The client-facing and internal-facing portal for Common House. Built on Next.js with Notion as the primary data backbone.

---

## What this is

Common House is a strategy, intelligence and production studio focused on zero-waste and circular economy work. This portal is the operational interface -- it surfaces project activity, decisions, knowledge, and internal tooling for both the CH team and their clients.

The portal has two distinct user types:

- **Clients** -- see their own project's Hall, Workroom, or Garage depending on engagement type. No access to other projects or admin areas.
- **Admin (CH team)** -- see the Control Room and all internal surfaces. Access to all projects, the agent queue, the evidence pipeline, and commercial tooling.

---

## Current product shape

Three client-facing workspaces are built and live:

| Surface | Route | Purpose |
|---|---|---|
| The Hall | `/hall` | Universal entry layer for every client. Narrative, decisions, team, conversations. |
| The Workroom | `/workroom` | Active delivery workspace for non-startup engagements. |
| The Garage | `/garage` | Startup and venture workspace. Built; activated per-project in Notion. |

One public-facing marketing surface:

| Surface | Route | Purpose |
|---|---|---|
| The Vitrina | `/vitrina` | Public page. No auth. Capabilities, team, desk entry points. |

One community surface:

| Surface | Route | Purpose |
|---|---|---|
| Living Room | `/living-room` | Community showcase. Members, milestones, themes. Partially implemented. |

The internal Control Room (`/admin` and sub-routes) is the CH team's main operating interface. It includes the evidence pipeline, decision center, agent queue, grants, commercial pipeline, and system health.

---

## Architecture overview

```
Browser
  └── Next.js App Router (src/app/)
        ├── Client routes  (/hall, /workroom, /garage, /dashboard, /living-room)
        ├── Admin routes   (/admin/*)
        ├── Public routes  (/vitrina, /sign-in)
        └── API routes     (/api/*)
              ├── Data queries (read Notion)
              ├── Cron-triggered AI pipelines (write to Notion)
              └── User-triggered skill runners (Claude + Notion writes)

Data backbone:
  Notion  → primary source of truth for all project, evidence, and knowledge data (21 DBs)
  Supabase → file storage (library docs, garage uploads) + agent_runs table

Auth:
  Clerk → sign-in/sign-up, session management
  Admin check → ADMIN_USER_IDS or ADMIN_EMAILS env vars
  Client-to-project mapping → hardcoded in src/lib/clients.ts

AI engine:
  Anthropic Claude SDK → briefing synthesis, evidence extraction,
                         competitive monitoring, grant scanning

External data sources:
  Fireflies → meeting transcripts (daily cron)
  Gmail     → email threads (daily cron)
  Google Drive → per-project document folders

Deployment:
  Vercel → London region (lhr1)
  Vercel Crons → 12 scheduled jobs (see docs/ROUTES_AND_SURFACES.md)
```

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.3 (App Router) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4 |
| Auth | Clerk (`@clerk/nextjs` v7) |
| Notion client | `@notionhq/client` v2 |
| Supabase client | `@supabase/supabase-js` v2 |
| AI | `@anthropic-ai/sdk` v0.88 |
| Charts | Tremor, Recharts |
| Maps | react-simple-maps |
| Document parsing | mammoth (docx), officeparser, xlsx |
| Document generation | pptxgenjs |
| Google APIs | `googleapis` (Drive) |
| Deployment | Vercel |

---

## Local setup

```bash
# Install dependencies
npm install

# Copy env vars (see Environment Variables section below)
cp .env.local.example .env.local

# Run dev server
npm run dev
```

The dev server runs at `http://localhost:3000`.

To serve the HTML mockups in `public/portal/`:

```bash
start-mockups.cmd
# or: npx serve public/portal -p 5500
```

---

## Environment variables

Required for local development:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key (use `pk_test_*` in dev) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_*` in dev) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Set to `/sign-in` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Set to `/hall` |
| `NOTION_API_KEY` | Notion integration token |
| `ADMIN_USER_IDS` | Comma-separated Clerk user IDs for admin access |
| `ADMIN_EMAILS` | Comma-separated email addresses for admin access |
| `ANTHROPIC_API_KEY` | Claude API key (used by AI pipeline routes) |
| `CRON_SECRET` | Shared secret for Vercel cron + agent-key auth |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (file storage + agent_runs table) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google SA email (Drive access) |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google SA private key |
| `FIREFLIES_API_KEY` | Fireflies GraphQL API key |
| `GMAIL_CLIENT_ID` | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth refresh token |
| `GMAIL_USER_EMAIL` | Gmail address to ingest from |
| `SUPER_ADMIN_EMAILS` | Emails with super-admin access (Library ingest gate) |

For production deployment, see `DEPLOY.md`.

---

## How auth works

1. Unauthenticated requests to `/` redirect to `/sign-in`.
2. Clerk handles sign-in. On success, users land on `/hall`.
3. The Next.js middleware (`src/middleware.ts`) protects all routes except `/sign-in`, `/`, and `/api/*`.
4. API routes handle their own auth (admin check or `x-agent-key`/`CRON_SECRET` header for cron/agent calls).
5. Admin access is determined by matching the Clerk `userId` against `ADMIN_USER_IDS` or the user's email against `ADMIN_EMAILS`. Both checks are done via `src/lib/require-admin.ts`.
6. Client-to-project mapping is in `src/lib/clients.ts` (CLIENT_REGISTRY). Each client email maps to a Notion project ID and optional Google Drive folder ID.

---

## Where data comes from

All project data -- status, evidence, decisions, people, knowledge -- lives in Notion. There are 21 Notion databases. Their IDs and types are defined in `src/lib/notion.ts`.

Supabase is used for file storage (library document ingestion and garage document uploads) and for at least one structured table: `/api/hall-data` reads from the `agent_runs` table to surface an agent pulse on the admin dashboard. It is not the primary database for project data, but it is not storage-only.

The automated pipeline pulls from Fireflies and Gmail daily, processes the content through Claude, and writes structured evidence back to Notion. See `docs/DATA_AND_INTEGRATIONS.md` for the full breakdown.

---

## Key route locations

- Client entry: `src/app/hall/page.tsx`
- Admin control room: `src/app/admin/page.tsx`
- Auth middleware: `src/middleware.ts`
- Admin guard: `src/lib/require-admin.ts`
- Client registry: `src/lib/clients.ts`
- Notion DB map + type definitions: `src/lib/notion.ts`
- Admin navigation: `src/lib/admin-nav.ts`
- Product type model: `src/types/house.ts`

---

## Known gaps and current status

- `src/lib/clients.ts` has one client entry. The comment in the file says to migrate to a Supabase table at 20+ clients.
- Clerk is likely still on test keys (`pk_test_*`). Must be rotated before going live with real clients. See `DEPLOY.md`.
- `/admin/health` is a stub. System health metrics are not yet rendered.
- `/dashboard` is an older overview surface. Its role relative to Hall and Workroom is unclear.
- The `backend/` and `frontend/` directories in this repo appear to be unrelated projects. They are not referenced by the Next.js portal. See `docs/DEVELOPMENT_STATUS.md`.
- Some `public/portal/*.html` mockups may be out of sync with the live Next.js implementation.

---

## Deeper documentation

- `docs/ARCHITECTURE.md` -- rooms, systems, data layers, how they relate
- `docs/ROUTES_AND_SURFACES.md` -- all routes with status
- `docs/DATA_AND_INTEGRATIONS.md` -- Notion, Supabase, Clerk, Anthropic, Drive, Fireflies, Gmail
- `docs/DEVELOPMENT_STATUS.md` -- what is live, what is partial, biggest risks
- `DEPLOY.md` -- production deployment steps and env var reference
- `.claude/PLATFORM-IA.md` -- platform information architecture spec (Sprint 20-25)
- `.claude/PLATFORM-DESIGN.md` -- design system tokens and visual rules
- `.claude/RUNBOOK.md` -- OS operational runbook
