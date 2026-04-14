# Data and Integrations

Last reviewed: 2026-04-14

---

## Notion

Notion is the primary source of truth for all project, evidence, knowledge, and people data.

The portal uses the `@notionhq/client` SDK (not the Notion MCP). The client is initialized in `src/lib/notion.ts` using `NOTION_API_KEY`. All 21 database IDs are defined in the `DB` constant in that file.

### Notion databases in use

| Name | Constant | Primary use |
|---|---|---|
| CH Projects [OS v2] | `DB.projects` | All client/portfolio project records |
| CH Evidence [OS v2] | `DB.evidence` | Atomic evidence extracted from sources |
| CH Sources [OS v2] | `DB.sources` | Raw source records (meetings, emails) |
| CH Knowledge Assets [OS v2] | `DB.knowledge` | Reusable cross-project knowledge |
| CH People [OS v2] | `DB.people` | All people (CH team, clients, EIRs) |
| Decision Items [OS v2] | `DB.decisions` | Open and resolved decisions |
| Insight Briefs [OS v2] | `DB.insightBriefs` | AI-synthesized insight briefs |
| Content Pipeline [OS v2] | `DB.contentPipeline` | Design + Comms production queue |
| Style Profiles [OS v2] | `DB.styleProfiles` | Brand/voice profiles per context |
| CH Organizations [OS v2] | `DB.organizations` | All orgs (clients, funders, partners, startups) |
| Valuations [OS v2] | `DB.valuations` | Startup valuations (Garage layer) |
| Cap Table [OS v2] | `DB.capTable` | Cap table entries (Garage layer) |
| Data Room [OS v2] | `DB.dataRoom` | Startup data room documents |
| Financial Snapshots [OS v2] | `DB.financialSnapshots` | Financial snapshot records |
| Proposal Briefs [OS v2] | `DB.proposalBriefs` | Commercial proposal briefs |
| Offers [OS v2] | `DB.offers` | Productised offers |
| Opportunities [OS v2] | `DB.opportunities` | All opportunities (CH, Portfolio, Grants) |
| Grant Sources [OS v2] | `DB.grantSources` | Grant funder source records (88 sources) |
| Agent Drafts [OS v2] | `DB.agentDrafts` | Claude-generated drafts awaiting review |
| Daily Briefings [OS v2] | `DB.dailyBriefings` | Daily AI briefing records |

Note: The `@notionhq/client` SDK uses "page IDs" (hex format, e.g. `49d59b18...`). The Notion MCP tools use a different "collection ID" format. Both resolve to the same live databases. The `src/lib/notion.ts` file has a mapping comment at the top showing which IDs correspond.

### How evidence flows

```
External sources (meetings, emails)
  ↓
ingest-meetings / ingest-gmail / fireflies-sync (crons)
  → CH Sources [OS v2]  (status: Ingested)
  ↓
extract-meeting-evidence (cron)
  → CH Evidence [OS v2]  (Validation Status: New)
  ↓
validation-operator (cron)
  → Validation Status: Reviewed | Auto-Validated | Escalated
  ↓
evidence-to-knowledge (cron)
  → CH Knowledge Assets [OS v2]  (reusable evidence only)
  ↓
project-operator (cron)
  → CH Projects [OS v2]  (Draft Status Update field)
```

---

## Supabase

Supabase is used for file storage and at least one structured data query.

Known use cases:

1. **Library document ingestion** (`/api/ingest-library`): Documents are uploaded to a `library-docs` Supabase bucket. Metadata is written to Notion after upload. Gated by `SUPER_ADMIN_EMAILS`.

2. **Garage document uploads** (`/api/garage-upload`): Generates signed upload URLs so the browser uploads directly to Supabase. After upload, `/api/garage-upload/finalize` creates the Notion record in Data Room [OS v2].

3. **Agent runs table** (`/api/hall-data`): Reads from a `agent_runs` table in Supabase to surface an agent pulse. This is a structured DB read, not file storage. It means Supabase holds at least one table of operational data alongside Notion.

The Supabase client is initialized inline in the routes that use it (not centralized via `src/lib/`).

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Both are listed in `DEPLOY.md`.

It is not confirmed whether `agent_runs` is the only Supabase table in use. A surface read of the routes found three use cases above; others may exist.

---

## Clerk

Clerk handles all authentication and user management.

- Sign-in flow: `/sign-in` renders the Clerk `<SignIn>` component.
- Session protection: `src/middleware.ts` calls `clerkMiddleware()` and protects all routes except `/sign-in`, `/`, and `/api/*`.
- Admin identification: `src/lib/require-admin.ts` calls `currentUser()` and checks the Clerk userId against `ADMIN_USER_IDS` (env var, comma-separated) or the email against `ADMIN_EMAILS` (env var, comma-separated).
- Client-to-project mapping: done by `getProjectIdForUser(email)` in `src/lib/clients.ts`. This function looks up the email in `CLIENT_REGISTRY`, a hardcoded TypeScript object.

Current state: Likely still using test Clerk keys (`pk_test_*`). Must be rotated to production keys (`pk_live_*`) before real clients sign in. See `DEPLOY.md`.

`CLIENT_REGISTRY` has one entry as of this audit. The comment in `clients.ts` says to migrate to a Supabase table at 20+ clients.

---

## Anthropic (Claude)

The Anthropic SDK is used for all AI synthesis tasks. There is no streaming -- all calls are standard `messages.create()` calls (some with `tool_use` for structured output).

Models used:
- `claude-haiku-4-5-20251001` -- daily briefings (cost-sensitive, high volume)
- `claude-sonnet-4-6` -- evidence extraction, competitive monitoring, grant radar (higher quality needed)

Routes that use Claude:

| Route | Task |
|---|---|
| `/api/generate-daily-briefing` | Synthesize daily briefing from Notion state |
| `/api/extract-meeting-evidence` | Extract atomic evidence from meeting transcripts |
| `/api/evidence-to-knowledge` | Identify reusable knowledge from validated evidence |
| `/api/project-operator` | Write Draft Status Updates for active projects |
| `/api/competitive-monitor` | Web-search for sector/competitor signals (uses `web-search-2025-03-05` beta) |
| `/api/grant-radar` | Web-search for open grant calls (same beta header) |
| `/api/garage-ingest` | Classify and extract from uploaded startup documents |
| `/api/garage-investor-update` | Generate investor update narrative |
| `/api/generate-draft` | Generic draft generation (emails, posts) |
| `/api/run-skill/draft-checkin` | Draft check-in email |
| `/api/run-skill/draft-followup` | Draft follow-up email |
| `/api/run-skill/identify-quick-win` | Quick win identification |
| `/api/run-skill/linkedin-post` | LinkedIn post draft |

All AI routes that write back to Notion are gated behind admin auth or cron auth (`CRON_SECRET`).

---

## Fireflies

Used for meeting transcript ingestion.

- `/api/fireflies-sync` pulls meeting metadata from the Fireflies GraphQL API daily.
- `/api/ingest-meetings` processes Fireflies transcripts into CH Sources [OS v2].

Required env var: `FIREFLIES_API_KEY`.

---

## Gmail

Used for email thread ingestion.

- `/api/ingest-gmail` reads Gmail threads via OAuth and creates Source records in CH Sources [OS v2].
- `/api/send-draft` sends approved agent drafts via Gmail.

Required env vars: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER_EMAIL`.

---

## Google Drive

Used for per-project document folders.

Each project in `CLIENT_REGISTRY` can have a `driveFolderId`. The portal reads documents from Drive and surfaces them in Hall/Workroom/Garage as "Shared Materials."

Auth: Google Service Account with Drive API scope.

Required env vars: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

Helper: `src/lib/drive.ts`. Folder structure constants: `src/lib/drive-constants.ts`.

Setup route: `/api/create-project-folders` creates the standard folder structure for a new project. `/api/setup-all-drives` runs this for all projects.

---

## Source of truth today

| Data type | Source of truth |
|---|---|
| Projects, evidence, decisions | Notion |
| Knowledge assets | Notion |
| People, organizations | Notion |
| Opportunities, grants, proposals, offers | Notion |
| Agent drafts, daily briefings | Notion |
| Client-project mapping | Hardcoded in `src/lib/clients.ts` |
| Admin users | Env vars (`ADMIN_USER_IDS`, `ADMIN_EMAILS`) |
| File attachments (library, garage) | Supabase storage |
| Agent run logs | Supabase (`agent_runs` table) |
| Meeting transcripts (raw) | Fireflies |
| Email threads (raw) | Gmail |
| Per-project documents | Google Drive |
| User sessions, identity | Clerk |

---

## Overlap and migration debt

1. **CLIENT_REGISTRY vs Notion**: Client-to-project mapping is hardcoded in TypeScript. Project properties (workspace type, hall mode) live in Notion. If a project is deleted or renamed in Notion, the code has a stale pointer. This is the most likely source of silent failures as the client count grows.

2. **Supabase vs Notion for file metadata**: The garage upload flow writes to both Supabase (the file) and Notion (the Data Room record). If the finalize step fails after upload, a file exists in Supabase with no Notion record. There is no reconciliation step.

3. **PLATFORM-IA.md Section 10 is outdated**: It describes the portal as "not yet built, everything is static HTML." The portal is now built. That section should not be treated as a current description.

4. **Supabase role is partially unclear**: The `agent_runs` table in Supabase is read by `/api/hall-data` but was not initially documented. It is not yet confirmed whether additional Supabase tables exist beyond what a surface read of the API routes reveals.
