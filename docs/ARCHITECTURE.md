# Architecture

Last reviewed: 2026-04-14

The portal is organized into three layers: client-facing Rooms, an internal Control Room, and a shared OS backbone. All three read from the same Notion data source.

---

## Three-layer model

```
LAYER 1 — ROOMS (client-facing)
  The Hall     /hall        Built ✓  Universal entry. All clients land here first.
  The Workroom /workroom    Built ✓  Delivery workspace. Activated per-project.
  The Garage   /garage      Built ✓  Startup workspace. Activated per-project.

LAYER 2 — CONTROL ROOM (internal staff)
  /admin and sub-routes     Built ✓  CH team only. Portfolio, agents, pipeline,
                                      evidence queue, knowledge, grants.

LAYER 3 — OS BACKBONE (data infrastructure)
  Notion (21 DBs)                    Source of truth for all project data.
  Automated pipelines (12 crons)     Ingest → extract → validate → synthesize.
  AI engine (Anthropic SDK)          Claude for synthesis tasks.
```

This is defined in `src/types/house.ts`. The type file is the canonical reference for the product model and should be read alongside this document.

---

## Client-facing Rooms

### The Hall (`/hall`)

The Hall is the universal entry layer. Every client -- regardless of engagement type -- lands here first and always has access to it via the sidebar.

It is driven by two Notion properties on each project:

- **Hall Mode** (`explore` or `live`) -- controls what content is shown. `explore` shows the orientation/framing state. `live` shows real status, decisions, and sessions.
- **Primary Workspace** (`hall`, `workroom`, or `garage`) -- controls whether the sidebar shows additional workspace links and whether the workspace activation block appears.

Content rendered:
- Hero (project name, stage, current focus, welcome note)
- What's Happening Now (current focus, next milestone)
- What We Heard (editorial narrative: challenge, what matters most, obstacles, success shape)
- Shared Materials (documents from Google Drive)
- Decisions (validated Decision evidence from Notion)
- Conversations (meeting summaries from Sources with Processed Summary)
- Hall Team (Internal people linked to the project)
- Digital Residents (capability layer -- visible only in live mode)
- Workspace activation blocks (transition moments between Hall and Workroom/Garage)

Source file: `src/app/hall/page.tsx`

### The Workroom (`/workroom`)

Activated when a project has `Primary Workspace = workroom` in Notion and `WORKSPACE_READY.workroom = true` (set in `src/types/workroom.ts`).

Non-workroom projects redirect to `/hall`. Admin users redirect to `/admin`.

The Workroom owns the delivery layer: live status, blockers, what is in motion, session log, agreements reached. The Hall owns framing and narrative. Both surfaces read the same Notion OS -- no data duplication.

Source file: `src/app/workroom/page.tsx`

### The Garage (`/garage`)

Activated when a project has `Primary Workspace = garage` in Notion. Built and ready; waiting for first garage project assignment.

The Garage is the startup lens: build focus, commitments, blockers, sessions, decisions, materials, investor update context.

Source file: `src/app/garage/page.tsx`

### The Dashboard (`/dashboard`)

An older overview surface. It includes `UploadZone` and a raw meetings section that predate the Hall/Workroom split. Currently accessible via sidebar under "Overview." Its long-term role is unclear -- it may be retired or repurposed once Hall and Workroom are fully established.

### The Living Room (`/living-room`)

Community showcase layer. Shows members, milestones, themes in motion, community signals. Public-safe data only (no client names, financials, pipeline). Partially implemented.

Source file: `src/app/living-room/page.tsx`

### The Vitrina (`/vitrina`)

Public marketing page. No authentication required. Shows capabilities, the CH team, desk entry points, sample outputs. Ported from `public/portal/hall-vitrina.html`.

---

## Control Room (`/admin`)

Admin-only. Protected by `requireAdmin()` which checks Clerk userId against `ADMIN_USER_IDS` or email against `ADMIN_EMAILS`.

The admin dashboard (`/admin/page.tsx`) is the primary internal interface. It is called "Hall v2" in the Sprint A/B comments. It renders:

1. Greeting header + date
2. Focus of the Day (from Daily Briefings [OS v2])
3. P1 Banner (active blockers + imminent deadlines -- red, always visible)
4. Stats row
5. Agent Queue (pending Claude-generated drafts awaiting approval)
6. Follow-up Queue (opportunities needing follow-up action)
7. My Commitments (open decisions + tasks from briefing)
8. Relationship Queue (cold/dormant contacts)
9. Active Portfolio (project table with warmth and stage)
10. Opportunities Explorer (CH and portfolio opportunities)
11. Ready to Publish (content pipeline items)

Sub-routes and what they do:

| Route | Content |
|---|---|
| `/admin` | Control Room main dashboard |
| `/admin/os` | Evidence queue + source pipeline metrics |
| `/admin/decisions` | Decision Items [OS v2] review and management |
| `/admin/agents` | Agent run status, last run, manual trigger UI |
| `/admin/grants` | Grant opportunities with fit scores and deadlines |
| `/admin/knowledge` | Knowledge Assets [OS v2] |
| `/admin/living-room` | Living Room curation interface |
| `/admin/garage-view` | Portfolio startup overview |
| `/admin/garage/[id]` | Startup detail page |
| `/admin/workrooms` | Workroom overview across all projects |
| `/admin/insights` | Insight Briefs with tabbed view |
| `/admin/comms` | Comms pipeline |
| `/admin/design` | Design pipeline |
| `/admin/offers` | Proposals and Offers |
| `/admin/pipeline` | Full opportunity pipeline |
| `/admin/deal-flow` | Investor matching interface |
| `/admin/investors` | Investor database |
| `/admin/opportunities` | Opportunities management |
| `/admin/my-rooms` | Personal lens: my projects, my deadlines |
| `/admin/projects/[id]` | Individual project detail |
| `/admin/health` | System health (stub) |

Navigation is defined in `src/lib/admin-nav.ts`.

---

## Transversal surfaces

### The Library (`/library`)

Cross-project knowledge layer. Shows Knowledge Assets [OS v2]. Currently admin-only. The type model in `src/types/house.ts` defines the content families (signals, cases, viewpoints, patterns) and a future client access model.

### Residents (`/residents`)

People directory showing CH team and EIRs. Currently admin-only. Also includes Digital Residents (the operational roles that surface inside Hall/Workroom/Garage).

---

## Automated OS pipeline

The OS pipeline runs automatically via Vercel crons (defined in `vercel.json`) on weekdays:

```
06:30 UTC  fireflies-sync           Pull latest Fireflies transcripts
07:00 UTC  ingest-gmail             Pull email threads via Gmail OAuth
07:00 UTC  competitive-monitor      Web search for sector signals (Mon only)
07:00 UTC  grant-radar              Web search for open grant calls (biweekly Wed)
07:30 UTC  generate-daily-briefing  AI-synthesized daily brief → Notion
18:00 UTC  ingest-meetings          Ingest Fireflies → Sources [OS v2]
00:00 UTC  ingest-meetings          Second pass (next calendar day)
02:00 UTC  extract-meeting-evidence Sources → Evidence [OS v2]
03:00 UTC  validation-operator      Triage new evidence (Auto/Reviewed/Escalate)
04:00 UTC  evidence-to-knowledge    Validated evidence → Knowledge Assets
05:00 UTC  project-operator         Update project Draft Status Updates
06:00 UTC  relationship-warmth      Compute contact warmth (Mon + Thu)
```

12 cron entries total (vercel.json). `ingest-meetings` runs twice daily (18:00 and 00:00 UTC) and counts as two entries.

All cron routes authenticate via `Authorization: Bearer <CRON_SECRET>` or `x-agent-key` header.

---

## API auth rule

`src/middleware.ts` marks `/api/*` as public. No Clerk session is enforced at the middleware level. Every route under `src/app/api/` must implement its own local auth.

Two patterns are in use:

| Pattern | Used for | Implementation |
|---|---|---|
| `adminGuardApi()` | User-triggered admin routes | `src/lib/require-admin.ts` — checks Clerk session against `ADMIN_USER_IDS` / `ADMIN_EMAILS`. Returns 401 if not admin. |
| `CRON_SECRET` header | Cron and agent pipeline routes | Checks `Authorization: Bearer <CRON_SECRET>` or `x-agent-key: <CRON_SECRET>`. Returns 401 if header does not match `process.env.CRON_SECRET`. |

Read-only public routes (`/api/hall-data`, `/api/living-room/*`) are intentionally open and should be documented as such in `docs/ROUTES_AND_SURFACES.md`.

No mutating API route should be created without one of the two patterns above.

---

## How workspace routing works

```
User signs in
  ↓
/ → if authenticated → /hall
      ↓
  /hall checks:
    isAdmin?  → redirect to /admin
    isClient? → check primaryWorkspace in Notion
    no project linked? → show "not linked" state

  Hall always renders regardless of primaryWorkspace.
  Sidebar shows workspace link only when WORKSPACE_READY.x = true.

  /workroom → checks: WORKSPACE_READY.workroom && user.project.primaryWorkspace === "workroom"
              no → redirect to /hall
  /garage   → checks: WORKSPACE_READY.garage   && user.project.primaryWorkspace === "garage"
              no → redirect to /hall
```

`WORKSPACE_READY` is a constant in `src/types/workroom.ts`. Both workroom and garage are currently set to `true`.

---

## Component structure

Components live in `src/components/`. Workspace-specific components are organized into subdirectories:

```
src/components/
  hall/           HallHero, WhatsHappeningNow, WhatWeHeard, HallDecisions,
                  HallTeam, Conversations, SharedMaterials, WorkspaceActivation,
                  GarageActivation, DigitalResidents
  workroom/       WorkroomHeader, ExecutiveSnapshot, ActiveBlockers, WorkroomDelta,
                  WhatsInMotion, SessionLog, AgreementsReached,
                  WorkroomDigitalResidents
  garage/         GarageHeader, GarageSnapshot, GarageBlockers, GarageCommitments,
                  GarageSessions, GarageDecisions, GarageMaterials,
                  GarageDigitalResidents
  (root)          Sidebar, StatusBadge, ActivityBar, MetricCard, ContentCard,
                  AgentQueueSection, InboxTriage, DraftUpdateCard, EvidenceQueueTable,
                  MeetingsSection, DocumentsSection, UploadZone, LibraryIngestPanel,
                  ProjectsMap, and others
```

---

## Type system

The product model is fully typed in `src/types/`:

- `house.ts` -- rooms, systems, workspace types, Digital Residents, Library, Residents, routing model
- `hall.ts` -- Hall surface types (HallProject, HallMaterial, HallConversation, HallDecision, HallTeamMember)
- `workroom.ts` -- Workroom block types + WORKSPACE_READY constant
- `garage.ts` -- Garage surface types
- `control-room.ts` -- Control Room types

`house.ts` is the most important file for understanding the product model. It contains the routing rules, the workspace assignment model, and the Digital Residents definition as constants.

---

## What is conceptual vs implemented

| Concept | Status |
|---|---|
| Hall (client entry layer) | Built and live |
| Workroom (delivery workspace) | Built and live |
| Garage (startup workspace) | Built; waiting for first garage project |
| Living Room (community layer) | Partially implemented |
| Library (knowledge layer) | Partially implemented; admin-only |
| Residents (people directory) | Partially implemented; admin-only |
| OS pipeline (ingest → evidence → validate → synthesize) | Live via Vercel crons |
| Commercial layer (Proposals, Offers, Pipeline) | Admin UI built; Notion data live |
| Grants (fit scoring, deadline tracking) | Live -- grant-radar cron + admin UI |
| Competitive monitoring | Live -- weekly cron |
| Daily briefing | Live -- daily cron, feeds admin dashboard |
| Desk request forms | Spec exists in PLATFORM-IA.md; not built in Next.js |
| Workspace suggestion agent | Described in house.ts; not implemented |
| Client-facing Library access | Defined in types; not implemented |
