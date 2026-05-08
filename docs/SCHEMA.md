# Common House Portal — canonical Supabase schema

Source of truth: the migrations in `supabase/migrations/`. This document is a
reading aid for agents and humans working on the OS — it lists the tables that
matter for OS v2 reads/writes and pins the enum values used in agent specs.

If you change a table or enum, update this file in the same commit.

---

## Tables touched by the OS v2 cadence

The OS v2 runner walks: `source-intake → evidence-review → db-hygiene-operator
→ validation-operator → project-operator → update-knowledge-asset →
knowledge-curator`. The tables below are everything those agents read or write.

### `sources`

Ingested raw material (Gmail thread, Fireflies meeting, library doc, calendar
event, etc.) that evidence is later extracted from.

Key columns: `id`, `source_type`, `title`, `processing_status` (`Ingested` |
`Processed` | `Blocked`), `relevance_status` (`Relevant` | `Needs Review` |
`Ignore`), `source_url`, `notion_id`, `created_at`, `updated_at`.

Owner agents: `source-intake` (insert), `evidence-review` (set `processing_status=Processed`).

### `evidence`

Atomic facts extracted from a `source`. Validated evidence is what the rest
of the OS reads.

Key columns: `id`, `source_id` (FK), `title`, `statement`, `source_excerpt`,
`evidence_type` (Decision | Blocker | Dependency | Requirement | Outcome |
Process Step | Concern | Objection | Risk | Stakeholder | Insight Candidate |
Assumption | Contradiction), `confidence_level` (High | Medium | Low),
`reusability` (Project-specific | Possibly Reusable | Reusable | Canonical),
`validation_status` (New | Reviewed | Validated | Rejected | Superseded),
`affected_theme`, `stakeholder_function`, `project_notion_id`, timestamps.

Owner agents: `evidence-review` (insert at `validation_status='New'`),
`validation-operator` (auto-validate / auto-review / escalate),
`db-hygiene-operator` (excerpt fill, safe fixes), `project-operator`
(read only — looks for new `Validated` material per project),
`update-knowledge-asset` and `knowledge-curator` (read only — distill
validated rows into reusable knowledge).

### `projects`

Active CH initiatives. Drives the project review queue.

Key columns: `id`, `notion_id`, `name`, `summary`, `stage`, `status_summary`,
`draft_status_update`, `project_update_needed` (boolean flag set by
`project-operator`), timestamps.

`project-operator` flips `project_update_needed=true` and invokes
`update-project-status`, which writes `draft_status_update`. **Never overwrite
`status_summary` directly.** Humans promote drafts.

### `decision_items`

Escalations, entity-creation proposals, classification decisions, ambiguity
resolutions. Replaces the deprecated `notion_decision_items` mirror.

Key columns: `id`, `notion_id`, `legacy_notion_id`, `legacy_source_db`,
`title`, `decision_type`, `priority` (`P1 Critical` | `P2 Important` |
`P3 Routine`), `status` (`Open` | `Resolved` | `Dismissed`),
`source_agent`, `requires_execute`, `execute_approved`, `due_date`,
`notes_raw`, `notion_url`, `category`, relation columns
(`org_notion_id`, `project_notion_id`, `evidence_notion_id`), audit
(`approved_at`, `approved_by`, `rejected_at`, `rejected_by`), timestamps.

Writer agents: most operators that hit ambiguity surface it here.
Reader: `/admin/os` (Decision Center), human approvers.

### `knowledge_assets`

Reusable / canonical evidence distilled into actionable rules. Produced by
`update-knowledge-asset` (proposal-only — humans accept and promote).

Key columns: `id`, `notion_id`, `legacy_notion_id`, `title`, `asset_type`,
`status` (`Draft` | `Active` | `Archived`), `body_md`, `summary`,
`knowledge_node_id` (FK to `knowledge_nodes` — the leaf this asset lives
under), `evidence_count`, `last_evidence_at`, timestamps.

### `knowledge_nodes`

The hierarchical domain knowledge tree. Each row is a theme / subtheme /
leaf with body markdown. Writer: `knowledge-curator` only.

Key columns: `id`, `path` (UNIQUE; e.g. `reuse/packaging/refill/on-the-go`),
`slug`, `parent_id`, `depth`, `title`, `summary`, `body_md`, `tags`, `facets`
(jsonb section vocabularies), `context_axes`, `status` (`Active` | `Stale` |
`Archived`), `reference_count`, `last_evidence_at`, `last_reviewed_at`,
`playbook_md`, timestamps.

Path convention:

| Depth | Example                              | Role     |
|-------|--------------------------------------|----------|
| 0     | `reuse`                              | Theme    |
| 1     | `reuse/packaging`                    | Subtheme |
| 2     | `reuse/packaging/refill`             | Subtheme |
| 3     | `reuse/packaging/refill/on-the-go`   | Leaf     |

Leaves carry `body_md` with the standard sections (`Overview`, `Available
solutions`, `How to implement`, `Anti-patterns`, `Case studies`, `Stakeholder
concerns`, `References`).

### `knowledge_node_changelog`

Every curator action against `knowledge_nodes`, with reasoning. Used for
auditing the tree's growth.

Key columns: `id`, `node_id` (FK), `evidence_notion_id`, `action`
(`CREATED` | `APPEND` | `AMEND` | `SPLIT` | `IGNORE`), `section`,
`diff_before`, `diff_after`, `reasoning`, `status` (`applied` | `proposed`
| `rejected`), `applied_by`, `created_at`, `applied_at`.

### `knowledge_node_citations`

Logged whenever an agent or skill loads a node for context. The
`AFTER INSERT` trigger increments `knowledge_nodes.reference_count`.

Key columns: `id`, `node_id` (FK), `cited_by`, `cited_at`, `context`.

### `organizations`, `people`

Canonical CRM entities. Owners: source-intake (proposes via `decision_items`),
human approver merges into these tables.

### `engagements`, `opportunities`

Sales-side relationship layer. Promoted from evidence by
`relationship-promotion-operator` (proposal only).

### `agent_drafts`

Output of skill-driven drafting (follow-up email, check-in email, LinkedIn
post, quick-wins report, etc.). Replaces the deprecated `notion_agent_drafts`
mirror.

Key columns: `id`, `notion_id`, `legacy_notion_id`, `draft_type` (NOT NULL),
`status` (`Pending Review` | `Approved` | `Sent` | `Draft Created` |
`Rejected` | `Superseded`), `title`, `body_md` (NOT NULL),
`target_person_notion_id`, `target_org_notion_id`, `source_agent`,
`approved_at`, `approved_by`, `superseded_by`, timestamps.

Writers: `src/lib/canonical-write.ts` (`createCanonicalRow`,
`updateCanonicalRow`) — see `/api/run-skill/*`, `/api/agent-scorecard`,
`/api/grant-monitor`, `/api/portfolio-health`, `/api/hall/nudge-draft`,
`/api/approve-and-send-draft`.

### `daily_briefings`, `insight_briefs`, `competitive_intel`, `content_pipeline_items`, `watchlist_entities`, `style_profiles`

Other canonical tables that replaced their `notion_*` mirror equivalents.
Same write-path (`createCanonicalRow`).

---

## Deprecated tables (deletion target)

`notion_decision_items`, `notion_daily_briefings`, `notion_insight_briefs`,
`notion_competitive_intel`, `notion_agent_drafts`, `notion_content_pipeline`,
`notion_watchlist`, `notion_sync_runs` — slated for `DROP CASCADE` at the
2026-06-02 freeze cutoff. Migration file already checked in:
`supabase/migrations/20260508120000_drop_notion_mirror_tables.sql` (NOT
applied — owner gates the apply moment).

The read-side helpers in `src/lib/notion-mirror.ts` and `src/lib/notion-cached.ts`
are still backed by these tables. Migrate those reads to the canonical tables
**before** applying the DROP migration.

---

## Enum quick-reference

Pin these values verbatim — agent code compares string literals.

| Field                                 | Allowed values |
|---------------------------------------|----------------|
| `evidence.validation_status`          | `New`, `Reviewed`, `Validated`, `Rejected`, `Superseded` |
| `evidence.confidence_level`           | `High`, `Medium`, `Low` |
| `evidence.reusability`                | `Project-specific`, `Possibly Reusable`, `Reusable`, `Canonical` |
| `sources.processing_status`           | `Ingested`, `Processed`, `Blocked` |
| `sources.relevance_status`            | `Relevant`, `Needs Review`, `Ignore` |
| `decision_items.priority`             | `P1 Critical`, `P2 Important`, `P3 Routine` |
| `decision_items.status`               | `Open`, `Resolved`, `Dismissed` |
| `agent_drafts.status`                 | `Pending Review`, `Approved`, `Sent`, `Draft Created`, `Rejected`, `Superseded` |
| `knowledge_nodes.status`              | `Active`, `Stale`, `Archived` |
| `knowledge_node_changelog.action`     | `CREATED`, `APPEND`, `AMEND`, `SPLIT`, `IGNORE` |
| `knowledge_node_changelog.status`     | `applied`, `proposed`, `rejected` |
| `knowledge_assets.status`             | `Draft`, `Active`, `Archived` |
