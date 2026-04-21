# Routes and Surfaces

Last reviewed: 2026-04-21

Status tags used below:
- **live** -- implemented, rendering real data, in active use
- **partial** -- implemented but incomplete, missing data or features
- **admin-only** -- live but restricted to CH team
- **legacy** -- older surface with unclear ongoing role
- **stub** -- route exists, placeholder UI, no real data
- **public** -- no auth required

---

## Client-facing routes

| Route | Status | Description | Source |
|---|---|---|---|
| `/` | live | Redirects authenticated users to `/hall`, unauthenticated to `/sign-in` | `src/app/page.tsx` |
| `/sign-in` | live | Clerk sign-in page | `src/app/sign-in/[[...sign-in]]/page.tsx` |
| `/hall` | live | Per-project portal. The universal client entry layer. Reads from Notion. | `src/app/hall/page.tsx` |
| `/workroom` | live | Active delivery workspace for non-startup engagements. Gated by `primaryWorkspace = workroom`. | `src/app/workroom/page.tsx` |
| `/garage` | live | Startup workspace. Built; no garage project assigned yet. Gated by `primaryWorkspace = garage`. | `src/app/garage/page.tsx` |
| `/dashboard` | legacy | Older overview surface with upload zone and raw meeting list. Predates Hall/Workroom split. | `src/app/dashboard/page.tsx` |
| `/vitrina` | live / public | Public marketing page. No auth required. Capabilities, team, desk entry points. | `src/app/vitrina/page.tsx` |
| `/living-room` | partial | Community showcase. Members, milestones, themes from Notion. Auth required; admin sees curation link. | `src/app/living-room/page.tsx` |
| `/residents` | admin-only | People directory (CH team + EIRs + Digital Residents). | `src/app/residents/page.tsx` |
| `/library` | admin-only | Knowledge Assets browser. Cross-project intelligence layer. | `src/app/library/page.tsx` |

---

## Admin routes (`/admin/*`)

All routes require admin auth via `requireAdmin()`.

| Route | Status | Description | Source |
|---|---|---|---|
| `/admin` | live | Control Room main dashboard. P1 banner, agent queue, follow-up queue, portfolio, opportunities, content. | `src/app/admin/page.tsx` |
| `/admin/os` | live | Evidence queue + source pipeline. Shows validation status, blockers, per-project evidence counts. | `src/app/admin/os/page.tsx` |
| `/admin/decisions` | live | Decision Items [OS v2]. Resolve, filter, manage. Server action: `src/app/admin/decisions/actions.ts` | `src/app/admin/decisions/page.tsx` |
| `/admin/agents` | live | Agent draft queue. Approve, request revision, or discard drafts. Manual agent run trigger. | `src/app/admin/agents/page.tsx` |
| `/admin/grants` | live | Grant opportunities with status, fit score, deadlines. Mark interest action. | `src/app/admin/grants/page.tsx` |
| `/admin/knowledge` | live | Knowledge Assets [OS v2] browser. | `src/app/admin/knowledge/page.tsx` |
| `/admin/living-room` | live | Curation interface for Living Room content. | `src/app/admin/living-room/page.tsx` |
| `/admin/garage-view` | live | Portfolio startup overview (all garage projects). | `src/app/admin/garage-view/page.tsx` |
| `/admin/garage/[id]` | live | Startup detail: financials, cap table, data room, investor update. | `src/app/admin/garage/[id]/page.tsx` |
| `/admin/workrooms` | live | Workroom overview across all active projects. | `src/app/admin/workrooms/page.tsx` |
| `/admin/insights` | live | Insight Briefs with tabbed view (client-type tabs). | `src/app/admin/insights/page.tsx` |
| `/admin/comms` | partial | Comms pipeline view. | `src/app/admin/comms/page.tsx` |
| `/admin/design` | partial | Design pipeline view. | `src/app/admin/design/page.tsx` |
| `/admin/offers` | partial | Proposals and Offers management. | `src/app/admin/offers/page.tsx` |
| `/admin/pipeline` | partial | Full opportunity pipeline. | `src/app/admin/pipeline/page.tsx` |
| `/admin/deal-flow` | partial | Investor matching interface. | `src/app/admin/deal-flow/page.tsx` |
| `/admin/investors` | partial | Investor database view. | `src/app/admin/investors/page.tsx` |
| `/admin/opportunities` | partial | Opportunities management. | `src/app/admin/opportunities/page.tsx` |
| `/admin/my-rooms` | partial | Personal lens: my projects and deadlines. | `src/app/admin/my-rooms/page.tsx` |
| `/admin/projects/[id]` | live | Individual project detail with evidence, draft update approval. | `src/app/admin/projects/[id]/page.tsx` |
| `/admin/health` | stub | System health stats. Route exists; no real data rendered. | `src/app/admin/health/page.tsx` |

---

## API routes

> **Auth rule:** `src/middleware.ts` marks `/api/*` as public — no Clerk session is enforced at the middleware level. Every route implements its own local auth. User-triggered admin routes use `adminGuardApi()` (`src/lib/require-admin.ts`). Cron and agent routes check `Authorization: Bearer <CRON_SECRET>` or `x-agent-key: <CRON_SECRET>`. Read-only public routes (marked "Public" below) are intentionally open. No new mutating route should be created without one of the first two patterns.

### Data query routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/hall-data` | GET | Public (reads Supabase) | Hall data endpoint |
| `/api/grants-data` | GET | Admin | Grant opportunities |
| `/api/offers-data` | GET | Admin | Offers list |
| `/api/decisions-queue` | GET | Admin | Decision items queue |
| `/api/living-room` | PATCH | Admin | Living Room curation writes (toggle shareToLivingRoom, etc.) |
| `/api/living-room/milestones` | GET | Admin | All projects for admin curation (unfiltered) |
| `/api/living-room/people` | GET | Admin | All people for admin curation (unfiltered) |
| `/api/living-room/signals` | GET | Admin | All insight briefs for admin curation (unfiltered) |
| `/api/living-room/themes` | GET | Admin | All knowledge assets for admin curation (unfiltered) |
| `/api/meeting-detail/[id]` | GET | Auth | Meeting detail by ID |
| `/api/content/[id]` | GET | Admin | Content item by ID |

### User-triggered action routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/approve-draft` | POST | Admin | Approve an agent draft |
| `/api/admin/approve-project-update` | POST | Admin | Approve a project status update |
| `/api/resolve-decision` | POST | Admin | Resolve a Decision Item |
| `/api/mark-grant-interest` | POST | Admin | Mark interest in a grant |
| `/api/desk-request` | POST | Admin | Submit a desk request |
| `/api/offers-create` | POST | Admin | Create a new offer |
| `/api/send-draft` | POST | Admin | Send an approved draft via Gmail |
| `/api/generate-draft` | POST | Admin | Trigger Claude draft generation |
| `/api/export-pptx` | POST | Admin | Export content as PPTX |

### Garage document routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/garage-upload` | POST | Admin | Generate Supabase signed upload URLs |
| `/api/garage-upload/finalize` | POST | Admin | Create Notion record after upload |
| `/api/garage-ingest` | POST | Admin | Ingest uploaded garage document via Claude |
| `/api/garage-investor-update` | POST | Admin | Generate investor update for startup |
| `/api/upload` | POST | Auth + project ownership | General file upload (any signed-in user with access to the target project) |

### Cron / AI pipeline routes (also callable manually)

All accept `Authorization: Bearer <CRON_SECRET>` or `x-agent-key: <CRON_SECRET>`.

| Route | Cron schedule | Description |
|---|---|---|
| `/api/ingest-meetings` | Weekdays 18:00 + 00:00 UTC | Pull Fireflies transcripts → Sources [OS v2] |
| `/api/fireflies-sync` | Weekdays 06:30 UTC | Sync Fireflies meeting metadata |
| `/api/ingest-gmail` | Weekdays 07:00 UTC | Pull Gmail threads → Sources [OS v2] |
| `/api/extract-meeting-evidence` | Weekdays 02:00 UTC | Sources → Evidence [OS v2] via Claude |
| `/api/validation-operator` | Weekdays 03:00 UTC | Triage new Evidence records |
| `/api/evidence-to-knowledge` | Weekdays 04:00 UTC | Validated evidence → Knowledge Assets |
| `/api/project-operator` | Weekdays 05:00 UTC | Update project Draft Status Updates |
| `/api/relationship-warmth` | Mon + Thu 06:00 UTC | Compute contact warmth scores |
| `/api/generate-daily-briefing` | Weekdays 07:30 UTC | AI daily brief → Daily Briefings [OS v2] |
| `/api/competitive-monitor` | Mondays 07:00 UTC | Web search for competitive/sector signals |
| `/api/grant-radar` | Biweekly Wednesdays 07:00 UTC | Web search for open grant calls |
| `/api/extract-conversation-evidence` | Weekdays 04:00 UTC + fire-and-forget from clipper | WhatsApp sources → Evidence records via Haiku |
| `/api/sync-loops` | Weekdays 08:00 UTC | Sync Notion → Supabase (action loops) |
| `/api/sync-opportunities` | Weekdays 09:00 UTC | Sync Notion → Supabase (opportunities) |
| `/api/sync-projects` | Weekdays 10:00 UTC | Sync Notion → Supabase (projects) |
| `/api/sync-evidence` | Weekdays 07:30 UTC | Sync Notion → Supabase (evidence) |
| `/api/sync-sources` | Weekdays 11:00 UTC | Sync Notion → Supabase (sources) |
| `/api/sync-organizations` | Weekdays 12:00 UTC | Sync Notion → Supabase (organizations) |
| `/api/sync-people` | Weekdays 12:00 UTC | Sync Notion → Supabase (people) |
| `/api/cron/observe-calendar` | Daily 06:00 UTC | Observe Google Calendar for suggested time blocks |
| `/api/plan/compute-kpi` | Daily 03:15 UTC | Compute KPI rollups for `strategic_objectives` |

20 cron entries are defined in `vercel.json`. `ingest-meetings` accounts for two entries (18:00 and 00:00 UTC).

### Skill runner routes (user-triggered Claude tasks)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/run-skill/draft-checkin` | POST | Admin | Draft a check-in email for a relationship |
| `/api/run-skill/draft-followup` | POST | Admin | Draft a follow-up email for an opportunity |
| `/api/run-skill/delegate-to-desk` | POST | Admin | Create a desk request from a decision |
| `/api/run-skill/identify-quick-win` | POST | Admin | Identify quick win for a project |
| `/api/run-skill/linkedin-post` | POST | Admin | Draft a LinkedIn post |
| `/api/agent-run` | POST | Admin | Generic agent run trigger |

### Maintenance / setup routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/create-project-folders` | POST | Admin | Create Google Drive folder structure |
| `/api/setup-all-drives` | POST | Admin | Setup Drive folders for all projects |
| `/api/seed-grant-sources` | POST | Admin | Seed Grant Sources database |
| `/api/ingest-library` | POST, DELETE | Admin (super-admin intent; gate not yet differentiated) | Ingest document into Library (Supabase + Notion) |
| `/api/inbox-triage` | GET | Admin or Cron | Triage inbox items |
| `/api/scan-opportunity-candidates` | POST | Admin or Cron | Scan recent evidence for opportunity candidates |

### Strategic Plan routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/plan/objectives` | GET, POST | Admin | List or create `strategic_objectives` |
| `/api/plan/objectives/[id]` | GET, PATCH, DELETE | Admin | Read, update, or soft-delete a strategic objective |
| `/api/plan/compute-kpi` | POST, GET | Cron/Admin | Compute KPI rollups (also scheduled — see cron table) |

---

## Static HTML files (`public/portal/`)

These are HTML mockups from the design phase. They are served statically and do not require the Next.js server.

| File | Status | Description |
|---|---|---|
| `hall-vitrina.html` | legacy reference | Original marketing Hall mockup. Largely superseded by `/vitrina`. |
| `hall-mockup.html` | legacy reference | Client Hall mockup (Auto Mercado example). Superseded by `/hall`. |
| `control-room.html` | legacy reference | Internal Control Room mockup. Superseded by `/admin`. |
| `platform-admin.html` | legacy reference | Admin platform mockup. Superseded by `/admin` routes. |
| `residents-mockup.html` | legacy reference | Residents directory mockup. Superseded by `/residents`. |
| `living-room.html` | legacy reference | Living Room mockup. Superseded by `/living-room`. |
| `living-room-admin.html` | active | Used by the living-room-agent skill for curation actions. |
| `design-system.html` | active | Design token reference. Used by PLATFORM-DESIGN.md. |
| `diagrama-agentes.html` | active | Agent architecture diagram for internal reference. |
| `competitive-intel.html` | legacy reference | Competitive intel mockup. May be superseded by admin views. |

Serve with: `npx serve public/portal -p 5500` or `start-mockups.cmd`.
