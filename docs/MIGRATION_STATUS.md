# Supabase Migration Status

Last reviewed: 2026-04-17 (Wave 5 — organizations + people)

Canonical Supabase project: `rjcsasbaxihaubkkkxrt` (commonhouse)
Legacy Supabase project:     `qihudqahvhxsamaskjqo` (cote_OS) — DO NOT USE

Canonical Vercel project:    `common-house-portal`
Legacy Vercel project:       `legacy-common-house-app` — quarantined, crons disabled

---

## Migration Map

| System / DB | Source of Truth | Supabase Target | Status | Notes |
|---|---|---|---|---|
| `opportunities` | Notion → Supabase (live sync) | `opportunities` | ✅ CLOSED | Live cron sync at 9am weekdays. `/admin/opportunities` and `/admin/ops-mirror` both read Supabase. |
| `loops` | Derived from Notion | `loops` | ✅ CLOSED | Cron sync at 8am weekdays. CoS Desk reads Supabase-first with Notion fallback. |
| `loop_signals` | Derived from Notion | `loop_signals` | ✅ CLOSED | Populated by sync-loops. Dedup by unique(loop_id, signal_type, source_id). |
| `loop_actions` | Derived from Notion + user actions | `loop_actions` | ✅ CLOSED | Audit log. Written by sync-loops (created/resolved) and cos-loops PATCH (status transitions). |
| `agent_runs` | Serverless runtime | `agent_runs` | ✅ CLOSED | `/api/agent-run` writes here. RLS: anon insert allowed. |
| `opportunity_candidates` | Notion (Status=New opps) | `opportunity_candidates` | 🚫 DO NOT TOUCH | Supabase table is a pre-provisioned artifact — 0 rows, never wired. Both routes are 100% Notion-native and working correctly. Candidates are stored as Notion opportunities with Status=New. No defect driving migration. |
| `projects` | Notion → Supabase (live sync) | `projects` | ✅ CLOSED | Live cron sync at 10am weekdays. 16 projects (12 Active, 4 Proposed). All Notion-source fields mirrored. Admin UI still reads Notion (getProjectsOverview joins evidence counts not in Supabase). |
| `evidence` | Notion → Supabase (live sync) | `evidence` | ✅ CLOSED | Live cron sync at 11am weekdays. 484 rows. 263 Validated, 36 Blockers, 1 Canonical. sync-loops still reads Notion directly (timing: 8am < 11am). No route switch yet. |
| `sources` | Notion → Supabase (live sync) | `sources` | ✅ CLOSED | Live cron sync at 11am weekdays. 69 rows. 68 Processed, 19 Meetings, 68 with processed_summary. No route switch yet. |
| `organizations` | Notion → Supabase (live sync) | `organizations` | ✅ CLOSED | Live cron sync at noon weekdays. 55 rows. 11 Startups, 2 Active Clients. Master entity table for joins. No UI route switch yet. |
| `people` | Notion → Supabase (live sync) | `people` | ✅ CLOSED | Live cron sync at noon weekdays. 30 rows. 15 with email. `/api/people-list` switched to Supabase-first. contact_warmth syncs from relationship-warmth-compute. |
| Garage data (Valuations, Cap Table, Data Room) | Notion + Supabase Storage | — | 🚫 DO NOT TOUCH | Garage is a separate product stream. Not in migration scope. |
| Editorial / Library / Content Pipeline | Notion | — | 🚫 DO NOT TOUCH | No read pressure. No migration needed. |
| Hall / Residents (display layer) | Notion | — | 🚫 DO NOT TOUCH | Hall must always reflect live Notion state. Never cache. |
| Grants / Decisions / Insights / Knowledge Assets | Notion | — | 🚫 DO NOT TOUCH | No read pressure. No migration needed. |

---

## Wave 1 Closure: `opportunities`

### Live schema (canonical Supabase)

```
notion_id             TEXT  PRIMARY KEY (bridge key)
title                 TEXT
status                TEXT
opportunity_type      TEXT
scope                 TEXT
qualification_status  TEXT
priority              TEXT
probability           TEXT
org_notion_id         TEXT
org_name              TEXT  (null — requires second Notion API call, omitted)
trigger_signal        TEXT
pending_action        TEXT  (same as trigger_signal)
source_evidence       TEXT
source_url            TEXT
review_url            TEXT  (Notion page URL)
suggested_next_step   TEXT
notes                 TEXT
why_there_is_fit      TEXT
value_estimate        NUMERIC
expected_close_date   DATE
follow_up_status      TEXT
opportunity_score     INTEGER
next_meeting_at       TIMESTAMPTZ
summary               TEXT
notion_created_at     TIMESTAMPTZ
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ  (= Notion last_edited_time on sync)
is_legacy             BOOLEAN DEFAULT false  (manually curated — NOT overwritten by sync)
is_archived           BOOLEAN DEFAULT false  (recomputed from status on every sync)
is_active             BOOLEAN DEFAULT true   (recomputed from status on every sync)
is_actionable         BOOLEAN DEFAULT false  (manually curated — NOT overwritten by sync)
has_signal            BOOLEAN
data_quality_score    INTEGER DEFAULT 0      (manually curated — NOT overwritten by sync)
last_signal_at        TIMESTAMPTZ
```

### Live sync route

`POST /api/sync-opportunities`
Cron: `0 9 * * 1-5` (9am weekdays, after sync-loops at 8am)
Auth: CRON_SECRET / x-agent-key

Behavior:
- Reads ALL pages from Notion Opportunities [OS v2] with pagination
- Upserts by `notion_id` (idempotent, safe to re-run)
- Updates all Notion-sourced fields on conflict
- Recomputes `is_active` (status ∈ {Active, Qualifying, New}) and `is_archived` (status ∈ {Closed Won, Closed Lost}) on every run
- Does NOT overwrite `is_legacy`, `is_actionable`, `data_quality_score` on existing rows

### Routes reading from Supabase

| Route | Function | Filter |
|---|---|---|
| `/admin/opportunities` | `fetchCleanOpportunitiesFromSupabase()` | `is_legacy=false`, `is_archived=false`, sorted by `opportunity_score DESC` |
| `/admin/ops-mirror` | `fetchOpportunitiesFromSupabase()` | None — full table, internal test surface |

### Routes that still read Notion directly (intentional)

| Route | Why |
|---|---|
| `POST /api/sync-loops` | Reads Notion opportunities to generate Loop Engine entries |
| `POST /api/sync-opportunities` | This IS the sync — reads Notion as its source |
| `POST /api/generate-daily-briefing` | AI briefing needs full Notion context including rich-text fields not stored in Supabase |
| `PATCH /api/followup-status` | Writes to Notion first (primary). Mirrors to `loop_actions` fire-and-forget. |

### Current row counts (2026-04-16)

```
total:    60
clean:    39  (is_legacy=false, is_archived=false)
active:   15  (is_active=true)
archived:  2  (is_archived=true, recomputed live)
legacy:   21  (is_legacy=true, manually curated)
```

---

## Wave 2 Closure: Loop Engine (`loops`, `loop_signals`, `loop_actions`)

### Tables

DDL: `scripts/loop_engine_schema.sql`

```
loops:
  id, normalized_key (UNIQUE), title, loop_type, status, intervention_moment,
  priority_score, linked_entity_type, linked_entity_id, linked_entity_name,
  notion_url, review_url, due_at, signal_count, first_seen_at, last_seen_at,
  last_action_at, created_at, updated_at

loop_signals:
  id, loop_id (FK→loops), signal_type, source_id, source_name,
  source_excerpt, captured_at, created_at
  UNIQUE (loop_id, signal_type, source_id)

loop_actions:
  id, loop_id (FK→loops), action_type, note, actor, created_at
```

### Sync

`POST /api/sync-loops`
Cron: `0 8 * * 1-5` (8am weekdays)
Auth: CRON_SECRET / x-agent-key

Three Notion sources:
1. CH Evidence [OS v2] — Validated Blockers (30 days)
2. Opportunities [OS v2] — Active/Qualifying/New with explicit signals
3. CH Projects [OS v2] — Active, "Project Update Needed?" = true

Auto-resolve: loops with `last_seen_at` older than 65 minutes marked `resolved`.

### Current row counts (2026-04-16)

```
loops:        17 (all open)
loop_signals: 17
loop_actions: 17
```

### Read path

`GET /api/cos-loops` — Supabase-first, returns open loops sorted priority_score DESC.
`getCoSTasks()` in `src/lib/notion.ts` — Supabase-first with Notion fallback.
Both use `getSupabaseServerClient()` (runtime env, no build-time inlining).

---

## Infrastructure

### Vercel

| Project | Status | Domain | Notes |
|---|---|---|---|
| `common-house-portal` | ✅ Canonical | `portal.wearecommonhouse.com` | All deployments go here |
| `legacy-common-house-app` | ✅ Quarantined | None | Renamed, crons disabled, no domain |
| `cote-os` | Unrelated | `cote-os.vercel.app` | Separate project, do not touch |

### Supabase

| Project | Status | Notes |
|---|---|---|
| `rjcsasbaxihaubkkkxrt` (commonhouse) | ✅ Canonical | All active writes and reads |
| `qihudqahvhxsamaskjqo` (cote_OS) | ⚠ Legacy | Contains stale loop data. Do not write. |

### Env var correctness

`getSupabaseServerClient()` in `src/lib/supabase-server.ts`:
- Uses `SUPABASE_URL` only (runtime, not build-time inlined)
- Falls back to `SUPABASE_ANON_KEY` if `SUPABASE_SERVICE_KEY` not set
- No singleton — fresh client on every call

`/api/agent-run/route.ts`:
- Uses `getSupabaseServerClient()` (fixed 2026-04-16)
- No longer uses `NEXT_PUBLIC_SUPABASE_URL` directly

---

## Wave 4 Closure: `evidence` + `sources` (paired)

### Tables

```
evidence:
  id, notion_id (UNIQUE), title, evidence_type, validation_status, confidence_level,
  reusability_level, sensitivity_level, evidence_statement, source_excerpt,
  topics (JSON), affected_theme (JSON), geography (JSON),
  project_notion_id, org_notion_id, source_notion_id,
  date_captured, reviewed_at, notion_created_at, created_at, updated_at

sources:
  id, notion_id (UNIQUE), title, source_type, source_platform,
  processing_status, relevance_status, sensitivity, access_level,
  processed_summary, sanitized_notes, attachment_notes,
  source_external_id, dedup_key, thread_id,
  evidence_extracted (bool), knowledge_relevant (bool), attachments_present (bool),
  source_url, project_notion_id, org_notion_id,
  source_date, last_source_update, notion_created_at, created_at, updated_at
```

### Sync routes

`POST /api/sync-evidence` — Cron: `0 11 * * 1-5` (11am weekdays)
`POST /api/sync-sources`  — Cron: `0 11 * * 1-5` (11am weekdays, same slot)

Both: Auth via CRON_SECRET / x-agent-key. Idempotent. Batch size 50.

### Row counts (2026-04-17, first sync)

```
evidence: 484 total | 484 with type | 484 validated_status | 153 with project | 111 with source_link
          263 Validated | 36 Blockers | 1 Canonical
sources:   69 total | 69 with type+platform | 68 Processed | 19 Meetings | 68 with summary
           50 evidence_extracted
```

### Why no route switch yet

- `sync-loops` reads evidence at 8am; `sync-evidence` runs at 11am — 3-hour gap means Supabase
  evidence is stale when the loop engine runs. Cannot switch until cron ordering is resolved or
  sync-evidence is moved to 7:30am.
- `hall-data` uses evidence only for a `New` count badge — low value switch on a client-facing route.
- All other evidence/sources reads are either AI briefing context (needs full Notion), Garage
  (DO NOT TOUCH), or project-specific queries that remain correct in Notion.

---

## Wave 5 Closure: `organizations` + `people` (paired)

### Tables

```
organizations:
  id, notion_id (UNIQUE), name, org_category, org_domains (JSON), themes (JSON),
  relationship_stage, country, city, website, notes, special_handling_notes,
  startup_stage, startup_sector (JSON), startup_investment_status,
  startup_funding_round, startup_mrr, startup_team_size,
  notion_created_at, created_at, updated_at

people:
  id, notion_id (UNIQUE), full_name, person_classification, relationship_roles (JSON),
  rol_interno, access_role, job_title, email, phone, linkedin,
  country, city, contact_warmth, last_contact_date, catchup_suggested,
  catchup_confidence, next_catchup_date, visibility,
  org_notion_id (→ organizations.notion_id),
  especialidad (JSON), disponibilidad, fee_structure, fecha_inicio, notes,
  notion_created_at, created_at, updated_at
```

### Sync routes

`POST /api/sync-organizations` — Cron: `0 12 * * 1-5` (noon weekdays)
`POST /api/sync-people`         — Cron: `0 12 * * 1-5` (noon weekdays, same slot)

Both: Auth via CRON_SECRET / x-agent-key. Idempotent. Batch size 50.

### Row counts (2026-04-17, first sync)

```
organizations: 55 total | 52 with category | 26 with stage | 49 with country
               11 Startups (all with startup_stage) | 3 with MRR | 23 with website
people:        30 total | 28 with classification | 15 with email | 18 with org_link
               22 with country | 28 with roles | 8 with rol_interno | 26 with job_title
               contact_warmth=0 (relationship-warmth-compute not yet run since migration)
```

### Route switch: `/api/people-list` → Supabase-first

Switched from Notion to Supabase. Admin-only, reads `notion_id + full_name + email`
where email IS NOT NULL, sorted by full_name. Identical result set. Deployed 2026-04-17.

### Why no other switches yet

- `relationship-warmth` WRITES contact_warmth + last_contact_date to Notion → stays Notion-write.
  After it runs, sync-people at noon picks up the new values. Future: write directly to Supabase.
- `generate-daily-briefing` reads people for AI context — needs full Notion rich-text.
- `garage-upload/finalize` reads organizations — Garage stream, DO NOT TOUCH.

### Cron chain (complete)

```
08:00  sync-loops           (weekdays)
09:00  sync-opportunities   (weekdays)
10:00  sync-projects        (weekdays)
11:00  sync-sources         (weekdays)
11:00  sync-evidence        (weekdays)
12:00  sync-organizations   (weekdays)
12:00  sync-people          (weekdays)
```

---

## Read-Path Switching Sprint (2026-04-17)

Three admin-only routes switched from direct Notion people reads to Supabase-first
with Notion fallback. No new tables created. Write paths unchanged.

### Routes switched

| Route | Old path | New path | Fields |
|---|---|---|---|
| `POST /api/assign-draft-contact` | `notion.pages.retrieve(personId)` | `people WHERE notion_id = personId` | `full_name, email` |
| `POST /api/run-skill/draft-checkin` | `notion.pages.retrieve(personId)` | `people WHERE notion_id = personId` | `full_name, job_title, email, contact_warmth, last_contact_date, notes` |
| `POST /api/run-skill/delegate-to-desk` | `notion.databases.query(PEOPLE_DB, Full Name contains …)` | `people WHERE full_name ILIKE '%name%'` | `notion_id, full_name, job_title, email` |

All three retain a Notion fallback: if `notion_id` lookup returns null (person not yet
synced since last noon run), the route falls back to the original Notion call.

### Routes audited but NOT switched (timing gap / write dependency)

| Route | Why deferred |
|---|---|
| `POST /api/validation-operator` | Runs at 3am; sync-evidence at 11am — 6-hour gap means new evidence would be missed |
| `POST /api/project-operator` | Same 3–11am cron timing gap |
| `POST /api/sync-loops` | Reads evidence at 8am; sync-evidence at 11am — stale window |
| `GET /api/generate-daily-briefing` | Needs full Notion rich-text for AI context |
| `POST /api/relationship-warmth` | WRITES contact_warmth to Notion → must remain Notion-write until direct Supabase write path is built |

---

## Cron Timing Cleanup Sprint 4 — Evidence Gap Closed (2026-04-17)

### Problem

`sync-loops` (8am) read evidence directly from Notion because `sync-evidence`
ran at 11am — 3 hours AFTER `sync-loops`. Supabase evidence was always stale at
the time sync-loops ran.

### Fix

**`vercel.json`**: moved `sync-evidence` from `0 11 * * 1-5` (11am) to `30 7 * * 1-5` (7:30am).
`sync-sources` stays at 11am — no consumer depends on it being earlier.

**`sync-loops syncEvidenceLoops()`**: switched evidence read from Notion
`databases.query` to Supabase `evidence WHERE validation_status=Validated AND evidence_type=Blocker
ORDER BY date_captured DESC LIMIT 30`. Notion URL reconstructed from `notion_id` (standard pattern).
Notion fallback preserved.

### Updated cron chain

```
02:00  extract-meeting-evidence  (Tue–Sat)
03:00  validation-operator       (Mon–Fri)
04:00  evidence-to-knowledge     (Mon–Fri)
05:00  project-operator          (Mon–Fri)
06:00  relationship-warmth       (Mon, Thu)
06:30  fireflies-sync            (Mon–Fri)
07:00  ingest-gmail              (Mon–Fri)
07:30  generate-daily-briefing   (Mon–Fri)
07:30  sync-evidence             (Mon–Fri)  ← moved from 11am
08:00  sync-loops                (Mon–Fri)  ← now reads evidence from Supabase ✅
09:00  sync-opportunities        (Mon–Fri)
10:00  sync-projects             (Mon–Fri)
11:00  sync-sources              (Mon–Fri)
12:00  sync-organizations        (Mon–Fri)
12:00  sync-people               (Mon–Fri)
18:00  ingest-meetings           (Mon–Fri)
```

### Routes re-evaluated but NOT switched

| Route | Why still Notion |
|---|---|
| `validation-operator` (3am) | Reads "Reviewed" evidence created by extract-meeting-evidence at 2am — 1 hour old, not yet in Supabase at 3am regardless of when sync-evidence runs |
| `project-operator` (5am) | Reads "Validated" evidence just classified by validation-operator at 3am — not yet in Supabase at 5am for the same reason |

These two routes are structurally inside the nightly evidence pipeline. They must
read from Notion until either (a) they are rescheduled to run after 7:30am, or
(b) the pipeline writes directly to Supabase instead of Notion.

---

## Read-Path Switching Sprint 3 — Final Wave (2026-04-17)

Two more internal cron routes switched. Backbone migration phase closed after this.

### Routes switched

| Route | Old path | New path | Notes |
|---|---|---|---|
| `POST /api/relationship-warmth` | `notion.databases.query(200 pages, Status != Archived)` | `SELECT notion_id, full_name, email, contact_warmth, last_contact_date FROM people` | Notion fallback if Supabase empty. Write path (Contact Warmth + Last Contact Date → Notion) unchanged. Status filter dropped — 30 rows, processing archived people is benign. |
| `POST /api/ingest-meetings` (people lookup) | `notion.databases.query(PEOPLE_DB, Email = email)` × up to 20 per run | `SELECT notion_id FROM people WHERE email = ?` × up to 20 per run | Notion fallback per email if not yet synced. Write path (Last Contact Date → notion.pages.update) unchanged. Removes up to 20 Notion DB queries per run (2× daily cron). |

### Routes audited but NOT switched — final state

| Route | Why stays on Notion |
|---|---|
| `POST /api/ingest-gmail` | Creates sources at 7am, sync-sources 11am — Supabase dedup misses same-day creates |
| `POST /api/extract-meeting-evidence` | Evidence dedup at 2am, sync-evidence 11am — 9h gap |
| `POST /api/fireflies-sync` | Writes last_contact_date back to Notion — Notion-write route |
| `POST /api/sync-loops` | Reads evidence at 8am, sync-evidence 11am — stale window |
| `POST /api/validation-operator` | Runs at 3am, sync-evidence 11am — 8h gap |
| `POST /api/project-operator` | Runs at 5am, sync-evidence 11am — 6h gap |
| `GET /api/generate-daily-briefing` | Needs full Notion rich-text for AI context quality |
| `POST /api/grant-radar` | Reads projects at 7am Wed, sync-projects 10am — stale |
| `POST /api/evidence-to-knowledge` | Runs at 4am, sync-evidence 11am — 7h gap |
| `POST /api/mark-grant-interest` | Admin-only, low invocation frequency — not worth complexity |

---

## Read-Path Switching Sprint 2 (2026-04-17)

Two more admin-only routes switched from Notion opportunity reads to Supabase-first.
No new tables created. Write paths unchanged.

### Routes switched

| Route | Old path | New path | Notes |
|---|---|---|---|
| `POST /api/scan-opportunity-candidates` | `notion.databases.query(150 pages, all non-terminal opps)` | `opportunities WHERE status NOT IN (Closed Won, Closed Lost, Stalled)` | Notion fallback preserved. Removes costliest per-invocation Notion call in the admin surface. Also fixes latent bug: was reading `props["Stage"]` (empty field); now reads correct `status` column. |
| `POST /api/run-skill/identify-quick-win` | `notion.databases.query(Active/Qualifying opps, 8 items)` | `opportunities WHERE status IN (Active, Qualifying) ORDER BY updated_at DESC LIMIT 8` | No fallback (AI context — staleness acceptable). Decisions/Content/People stay Notion. `Follow-up Status` not in Supabase `people` table so People query cannot switch yet. |

### Routes audited but NOT switched

| Route | Why deferred |
|---|---|
| `POST /api/ingest-gmail` | Creates sources at 7am; sync-sources at 11am — Supabase dedup would miss same-day creates on any re-run |
| `POST /api/extract-meeting-evidence` | Evidence dedup check: sync-evidence at 11am is stale relative to 2am cron |
| `POST /api/fireflies-sync` | Reads People + Sources + Projects and WRITES back last_contact_date — stays Notion-write |
| `POST /api/relationship-warmth` | WRITES contact_warmth + last_contact_date to Notion — stays Notion-write |
| `POST /api/mark-grant-interest` | Low invocation frequency; org name search not critical path |
| `POST /api/grant-radar` | Project context for AI prompt; runs at 7am Wed, before sync-projects 10am |
| `POST /api/evidence-to-knowledge` | Evidence read for AI prompt; 4am cron, sync-evidence 11am — stale |

---

## Migration backbone status: COMPLETE — Phase closed 2026-04-17

All tables with active read/write pressure are now in Supabase. All safe internal
read-path switches have been executed across 3 sprints. No remaining Notion reads
have a safe, valuable switch that doesn't hit a cron timing gap or write dependency.

### Complete list of switched routes (all sprints)

| Route | Switched field(s) | Table |
|---|---|---|
| `GET /api/people-list` | Full list read | `people` |
| `POST /api/assign-draft-contact` | Person name + email by notion_id | `people` |
| `POST /api/run-skill/draft-checkin` | Full person profile by notion_id | `people` |
| `POST /api/run-skill/delegate-to-desk` | Person search by full_name ILIKE | `people` |
| `POST /api/scan-opportunity-candidates` | All non-terminal opps for dedup | `opportunities` |
| `POST /api/run-skill/identify-quick-win` | Active/Qualifying opps for AI context | `opportunities` |
| `POST /api/relationship-warmth` | All people for warmth compute | `people` |
| `POST /api/ingest-meetings` | Person page ID lookup by email | `people` |

### Remaining Notion reads — why they stay

Routes with cron timing gaps (cron fires before sync completes):
- `ingest-gmail` (7am, sync-sources 11am)
- `extract-meeting-evidence` (2am, sync-evidence 11am)
- `sync-loops` (8am, sync-evidence 11am)
- `validation-operator` (3am, sync-evidence 11am)
- `project-operator` (5am, sync-evidence 11am)
- `grant-radar` (7am Wed, sync-projects 10am)
- `evidence-to-knowledge` (4am, sync-evidence 11am)

Routes with Notion write dependencies (read + write same session):
- `relationship-warmth` write side
- `ingest-meetings` write side
- `fireflies-sync`

Routes needing full Notion rich-text:
- `generate-daily-briefing`

### What comes next

Not more migration. The backbone is stable. Useful next phases:
1. ~~**Cron timing cleanup**~~ — **DONE 2026-04-17**: `sync-evidence` moved to 7:30am.
   `sync-loops` evidence read switched to Supabase-first. See Sprint 4 below.
2. **Supabase write paths** — `relationship-warmth` and `ingest-meetings` write
   `contact_warmth` / `last_contact_date` directly to Supabase, eliminating the noon
   sync lag for warmth data
3. **Observability** — query latency logging, sync health dashboard

Cron chain: sync-loops 8am → sync-opportunities 9am → sync-projects 10am →
sync-sources + sync-evidence 11am → sync-organizations + sync-people noon (weekdays).

---

## Why this order is correct

1. **`opportunities` first** — highest-read admin surface. Batch migration + live sync cron now closed.
2. **Loop Engine second** — replaces heuristic Notion CoS tasks with persistent scored table.
3. **`agent_runs` third** — trivial, required for `/api/agent-run` auth guard to work.
4. **`projects` fourth** — complete Notion mirror at 10am. Admin UI still Notion-first (evidence join).
5. **`evidence` + `sources` fifth (paired)** — operational intelligence layer. 484 + 69 rows live. Read paths stay Notion for now (cron timing gap). Ready for future Supabase-first queries.
6. **`organizations` + `people` sixth (paired)** — master entity tables. 55 + 30 rows live. `/api/people-list` switched to Supabase-first. Future joins from projects/opportunities/evidence can resolve org and people names from Supabase without Notion calls.
7. **Hall / Garage never** — Hall must be live Notion. Garage is separate product stream.
