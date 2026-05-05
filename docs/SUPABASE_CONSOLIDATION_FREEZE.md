# Supabase Consolidation — Freeze Decisions (Phase 0)

**Status:** APPROVED — frozen on 2026-05-05
**Cutoff Date:** **2026-06-02** (4 weeks from approval)
**Owner:** Jose Manuel Moller
**Scope:** Decommission Notion as a write target across the Common House OS v2. Make Supabase the single source of truth.

---

## 1. Principle

After cutoff, **only Supabase accepts writes** for OS v2 entities. Notion becomes a read-only archive of pre-cutoff state. No bidirectional sync. No mirror tables. One field, one place, one writer.

This decision is binding. Any future PR that imports `@notionhq/client` for a write operation must be rejected.

## 2. Cutoff date

**2026-06-02 — 23:59 UTC.**

Sequenced milestones:

| Date | Milestone |
|---|---|
| 2026-05-05 | Phase 0 doc frozen (this file) |
| 2026-05-08 | Phase 1 — Schema migration applied to Supabase prod |
| 2026-05-13 | Phase 2 — Final Notion → Supabase backfill with dedup |
| 2026-05-20 | Phase 3 — All 14 agents rewritten and validated against Supabase |
| 2026-05-27 | Phase 4 — All API routes migrated; Notion writes audited to zero |
| 2026-05-30 | Phase 5 — UI gap fill complete |
| 2026-06-02 | **Phase 6 — Notion frozen. Sync killed. `@notionhq/client` write paths deleted.** |
| 2026-06-05 | Phase 7 — `relationship-promotion-operator` runs first time on clean architecture; Engatel surfaces in Decision Center |

Slippage on any milestone is acceptable; the cutoff itself is not. If Phase 5 is at risk, scope is cut, not extended.

## 3. Canonical mapping — Notion DB → Supabase table

This is the contract. Every row that exists in a Notion DB on the left must end up in the table on the right by 2026-05-13. Every write after cutoff goes only to the right side.

### 3.1 OS v2 core entities

| Notion DB | Notion ID | Supabase target | Action |
|---|---|---|---|
| CH Sources [OS v2] | `d88aff1b…d0ae` | `sources` (87 rows) | Add columns; keep table name |
| CH Evidence [OS v2] | `fa281249…ccf5` | `evidence` (1137 rows) | Already canonical; add `legacy_notion_id` |
| CH Projects [OS v2] | `49d59b18…32c5f` | `projects` (16 rows) | Add columns: `status_summary`, `draft_status_update`, `stage` |
| CH Organizations [OS v2] | `bef1bb86…b96c` | `organizations` (55 rows) | Add `relationship_classes text[]`, `engagement_type`, `engagement_value` |
| CH People [OS v2] | `1bc0f96f…81de` | `people` (352 rows) | Already canonical |
| CH Decision Items [OS v2] | `6b801204…285a` | **`decision_items`** (NEW — replaces `notion_decision_items` mirror, 29 rows) | Promote mirror to canonical |
| CH Knowledge Assets [OS v2] | `0f4bfe95…9b04` | **`knowledge_assets`** (NEW — distinct from `knowledge_nodes` tree) | New table |
| CH Conversations [OS v2] | (no constant) | `conversation_messages` (5988 rows) + new `conversations` parent table | Per-thread parent + per-message child |
| Engagements / CH Startup Relationships | `289f7075…1ae9` (data source `e9bfae0e…c083`) | **`engagements`** (NEW) | New table; FK to `organizations` |

### 3.2 Sales / commercial layer

| Notion DB | Notion ID | Supabase target | Action |
|---|---|---|---|
| CH Opportunities [OS v2] | `687caa98…be0c0` | `opportunities` (71 rows) | Already exists; add columns |
| CH Proposal Briefs [OS v2] | `76bfd50f…ae67` | **`proposal_briefs`** (NEW) | Replaces `prep_briefs` for proposals |
| CH Offers [OS v2] | `58b863e9…394f` | **`offers`** (NEW) | New table |
| CH Grant Sources [OS v2] | `3f4f4ffc…d4f7` | **`grant_sources`** (NEW) | New table |

### 3.3 Garage / portfolio financial layer

| Notion DB | Notion ID | Supabase target | Action |
|---|---|---|---|
| CH Valuations [OS v2] | `37a3686e…1d60` | **`valuations`** (NEW) | FK to `organizations` |
| CH Cap Table [OS v2] | `cd3038b6…93b7` | **`cap_table_entries`** (NEW) | FK to `organizations` |
| CH Data Room [OS v2] | `d3c56da9…f412` | **`data_room_documents`** (NEW) | FK to `organizations` |
| CH Financial Snapshots [OS v2] | `fdaf8df8…7e09` | **`financial_snapshots`** (NEW) | FK to `organizations` or `projects` |

### 3.4 Content / comms / intel layer

| Notion DB | Notion ID | Supabase target | Action |
|---|---|---|---|
| CH Insight Briefs [OS v2] | `04bed3a3…e08a` | **`insight_briefs`** (replaces `notion_insight_briefs` mirror, 8 rows) | Promote mirror to canonical |
| CH Content Pipeline [OS v2] | `3bf5cf81…fdc0` | **`content_pipeline_items`** (replaces `notion_content_pipeline` mirror, 37 rows) | Promote mirror to canonical |
| CH Style Profiles [OS v2] | `606b1aaf…dc14` | **`style_profiles`** (NEW) | New table |
| CH Agent Drafts [OS v2] | `9844ece8…5a90` | **`agent_drafts`** (replaces `notion_agent_drafts` mirror, 15 rows) | Promote mirror to canonical |
| CH Daily Briefings [OS v2] | `d206d6cd…9f2a` | **`daily_briefings`** (replaces `notion_daily_briefings` mirror, 14 rows) | Promote mirror to canonical |
| CH Watchlist [OS v2] | `d5fad997…e211` | **`watchlist_entities`** (replaces `notion_watchlist` mirror, 14 rows) | Promote mirror to canonical |
| CH Competitive Intel [OS v2] | `af8d7edb…556a` | **`competitive_intel`** (replaces `notion_competitive_intel` mirror, 11 rows) | Promote mirror to canonical |

### 3.5 Legacy DBs to be archived (read-only export, no migration)

| Notion DB | Notion ID | Action |
|---|---|---|
| Organisations [master] | `26c45e5b…58d` | Read once, dedupe-merge into `organizations` via `legacy_notion_id`. Archive page in Notion. |
| Deals | `26f45e5b…59be` | Same: merge into `engagements` (won deals) and `opportunities` (active deals). |
| Projects [master] | `26c45e5b…2a33` | Merge into `projects`. |

After 2026-06-02 these three Notion DBs are renamed to `[ARCHIVED] …` and made read-only. No code may reference them.

### 3.6 Tables eliminated (mirror layer)

Once their canonical counterpart is live (Phase 4):

```
DROP TABLE notion_decision_items;
DROP TABLE notion_daily_briefings;
DROP TABLE notion_insight_briefs;
DROP TABLE notion_watchlist;
DROP TABLE notion_competitive_intel;
DROP TABLE notion_agent_drafts;
DROP TABLE notion_content_pipeline;
DROP TABLE notion_sync_runs;
```

### 3.7 Code paths to be deleted (Phase 6)

```
src/lib/notion-sync.ts
src/lib/notion-push.ts
src/lib/notion-mirror.ts
src/lib/notion-mirror-push.ts
src/lib/notion-cached.ts
src/lib/notion.ts                  → reduce to read-only helpers used in archive viewers, or delete
src/lib/notion/core.ts              → keep only if read-only browse is preserved; otherwise delete
src/lib/notion/{decisions,evidence,projects,people,sources,knowledge,…}.ts → delete
src/app/api/sync-organizations/      → delete
src/app/api/hall-organizations/sync-notion/  → delete
```

Plus every `import { notion } from "@notionhq/client"` write call in `src/app/api/**`.

## 4. UI gap policy

A "UI gap" is any OS v2 surface where the team currently edits in Notion but the portal has no equivalent edit page.

**Rule for cutoff:**
- If a UI gap is closed by 2026-05-30 → portal is the editor.
- If a UI gap is **not** closed by 2026-05-30 → that surface becomes append-only via API (new records yes, edit no) until UI lands. Notion is **not** reopened.

Identified gaps as of 2026-05-05 (to be assigned in Phase 5):

| Surface | Has portal UI today? | Gap action |
|---|---|---|
| Decision Items review/approve | Partial (`/admin/decisions`) | Extend to cover all decision types |
| Evidence record edit | No | Build minimal CRUD |
| Project status edit (Status, Stage, Status Summary) | No | Build edit form |
| Organization full edit | Partial (tag only) | Extend `/admin/hall/organizations/[domain]` |
| Engagements CRUD | No | Build new section under `/admin/clients` |
| Knowledge Assets edit | Partial (read-mostly) | Extend `/admin/knowledge` |
| Daily Briefings edit | No | Append-only acceptable; agent writes |
| Watchlist add/remove | No | Build in Hall |
| Content Pipeline | No | Already exists in portal (`comms_*` tables) — reconcile naming |

Anything not in this list is presumed write-only-by-agent and needs no portal UI.

## 5. RLS policy (mandatory at Phase 1)

The Supabase advisory flagged 56 tables with RLS disabled. Phase 1 migration **must include**:

1. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on every public table.
2. A baseline policy per table allowing the service role full access and the anon role nothing (or narrow read where the portal genuinely needs it via the anon key, which is currently nowhere).
3. Verification: re-run advisory; expect zero `rls_disabled` warnings.

This is non-negotiable and ships with Phase 1, not after.

## 6. Acceptance criteria for "we are done"

The consolidation is complete when **all** of these are true:

1. `git grep "@notionhq/client"` returns zero hits in non-archive code paths.
2. `notion_*` tables do not exist in Supabase.
3. `notion-sync.ts`, `notion-push.ts`, `notion-mirror*.ts` do not exist.
4. No cron job calls a Notion API.
5. Every `.claude/agents/*.md` references Supabase tables, not Notion DB names.
6. `relationship-promotion-operator` runs and Engatel appears in `/admin/decisions` with proposal "Classify as Active Client".
7. Supabase advisory shows zero `rls_disabled` items on `public` schema.
8. Each of the 22 Notion OS v2 DBs has a banner: *"READ ONLY — historical archive. Edit in portal.wearecommonhouse.com."*

If any one of these eight is false, we are not done.

## 7. Rollback policy

There is none. The cutoff is one-way. The reasoning: maintaining a rollback path requires keeping the sync layer alive, which is the thing we are eliminating. The mitigation is that Phase 2 (backfill) preserves every record with `legacy_notion_id`, and the archived Notion DBs remain visible read-only forever. Data loss is structurally impossible; behavior changes are.

## 8. Out of scope

Explicitly not changing in this consolidation:
- The portal's design system / Hall theming.
- Clerk auth or middleware.
- The OS v2 cadence in `os-runner` (still runs the same 6 steps; only the storage layer changes).
- Gmail / Fireflies / Drive / Calendar ingestion sources (all already write Supabase).

## 9. Approvals

- [x] Jose Manuel Moller — 2026-05-05
- [x] Pancho Cerda — informed and aligned, 2026-05-05

## 10. Addenda — design decisions surfaced post-Phase 0

These were not in the original freeze but emerged from Phase 1 schema
implementation and Phase 3 agent-rewrite drafts. Captured here so the
contract stays in one place.

### 10.1 source-intake entity proposals: structured columns (decided 2026-05-05)

Original `source-intake` agent encoded entity-creation proposals as marker
tokens (`[ENTITY_ACTION:create_org][ORG_NAME:…]`) embedded in a Notion
rich-text field, parsed by the Decision Center.

**Decision: structured columns, no markers.** Phase 1.5 migration adds:
- `decision_items.entity_action text` — e.g. `create_org`, `classify_relationship`
- `decision_items.entity_payload jsonb` — typed payload per action
- `decision_items.entity_id text`, `entity_table text` — generic FK ref
- `decision_items.resolution_field text`, `resolution_type text`,
  `resolution_target_table text` — what a decision writes when approved

Decision Center UI reads these columns directly. No more text parsing.
The `source-intake` rewrite in `docs/migration/agent-drafts/source-intake.md`
uses this contract.

### 10.2 hygiene-agent — `automations` table (DECISION PENDING)

`hygiene-agent` originally writes to `automations.human_override_needed`
and appends to `automations.notes`. The `automations` table does **not**
exist in Supabase as of 2026-05-05.

**Open decision:** pick one before Phase 3 lands.
- **Option A:** add a new `automations` table to Phase 1 scope (migration
  `20260505120500_phase1_automations.sql`). Mirrors the Notion DB shape.
- **Option B:** redirect hygiene-agent writes to `agent_health_diagnoses`
  (already exists, 8 rows) — extend its schema to carry the override flag.
- **Option C:** redirect to `agent_runs` (already exists) with a JSONB
  `health_override` column.

Recommendation: **Option B**. `agent_health_diagnoses` already exists
with the right shape; one column add suffices.

Awaiting decision before Phase 3 hygiene-agent rewrite is finalised.

### 10.3 `payload jsonb` escape hatch on the 18 new tables

Phase 1.4 migration adds `payload jsonb` to every new canonical table.
Used by Phase 2 backfill's generic mapper for tables whose column-bound
schema isn't yet stable. Phase 4 work binds proper columns; Phase 6
**drops** `payload`. Acceptance criterion #2 is updated to also require:

> `payload` column does not exist on any table in `public.*` after cutoff.

### 10.4 Column gaps surfaced by Phase 3 (added 2026-05-05)

Phase 1.5 also added these columns based on agent-rewrite analysis:
- `evidence.people_involved uuid[]` (with GIN index)
- `organizations.legacy_record_url text`
- `people.legacy_record_url text`

No design decisions; mechanical additions to support 1:1 contract
preservation in the agent rewrites.
