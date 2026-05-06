# Phase 3 — Agent Rewrites Summary

**Date:** 2026-05-XX (drafts produced)
**Source:** `docs/SUPABASE_CONSOLIDATION_FREEZE.md` §3 (canonical mapping)
**Drafts:** `docs/migration/agent-drafts/<agent>.md` — one per agent below.
**Originals:** `.claude/agents/<agent>.md` — UNTOUCHED. Drafts must be reviewed before any move.

The 14 agents below were rewritten to read/write Supabase tables exclusively. The behavioral contract of each agent (scope, gates, what it does NOT do, output shape, position in autonomous loop) is preserved. Only the data layer references change.

---

## Per-agent mapping

For each agent: which Notion DBs it referenced in the original, and which Supabase tables now replace them.

### 1. briefing-agent
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Projects [OS v2] | `projects` |
| CH Opportunities [OS v2] | `opportunities` |
| CH Engagements / Startup Relationships | `engagements` |
| CH People [OS v2] | `people` |
| CH Financial Snapshots [OS v2] | `financial_snapshots` |
| CH Content Pipeline [OS v2] | `content_pipeline_items` |
| Garage DBs (Valuations / Cap Table / Data Room / Financials) | `valuations`, `cap_table_entries`, `data_room_documents`, `financial_snapshots` |
| Agreements (read via control-room) | `engagements` + (grant subset → `grant_sources`) |

Read-only. Mechanical rewrite.

### 2. db-hygiene-operator
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Evidence [OS v2] | `evidence` |
| CH Sources [OS v2] | `sources` |
| CH Projects [OS v2] | `projects` |

Properties (`Source Excerpt`, `Validation Status`, `Confidence Level`, `Project Status`, `Date Captured`, `Source Date`, `Processing Status`, `Relevance Status`) → renamed to snake_case columns (`source_excerpt`, `validation_status`, `confidence_level`, `status`, `date_captured`, `source_date`, `processing_status`, `relevance_status`). Mechanical rewrite.

### 3. deal-flow-agent
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Organizations [OS v2] | `organizations` |
| CH Engagements / Startup Relationships | `engagements` |
| CH Opportunities [OS v2] | `opportunities` |
| CH Decision Items [OS v2] (`6b801204…285a`) | `decision_items` (canonical, replacing `notion_decision_items` mirror) |

`notion-create-pages` for missing-data decision items → `INSERT INTO decision_items` (or portal API). Mechanical rewrite.

### 4. evidence-review
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Sources [OS v2] | `sources` |
| CH Evidence [OS v2] | `evidence` |
| CH Projects [OS v2] | `projects` |
| CH Organizations [OS v2] | `organizations` |
| CH People [OS v2] | `people` |
| CH Conversations [OS v2] | `conversations` (parent) + `conversation_messages` |

Property→column rename across the full schema reference block. Mechanical rewrite, but the column-naming details mean extra care is needed during review (every enum needs to match real Supabase enum values).

### 5. hygiene-agent
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Automations | `automations` (assumed already exists in Supabase per `automation-health-review` skill) |
| CH Organizations [OS v2] | `organizations` |
| CH People [OS v2] | `people` |
| CH Decision Items [OS v2] | `decision_items` |

`Human Override Needed` → `human_override_needed`. `Legacy Record URL` → `legacy_record_url`. Mechanical rewrite.

### 6. knowledge-curator
| Source referenced | Supabase target |
|---|---|
| Supabase `public.knowledge_nodes` | `knowledge_nodes` (already canonical — unchanged) |
| Supabase `public.evidence` | `evidence` (already canonical — unchanged) |
| `knowledge_node_changelog` | `knowledge_node_changelog` (already canonical) |

Already Supabase-native. Rewrite only clarifies that evidence reads use the canonical `evidence` table (not any `notion_*` mirror) and adds `legacy_notion_id` mention for traceability. **Almost zero mechanical changes** — a soft pass.

### 7. os-runner
Orchestrator — references each step agent's data layer indirectly. Updated:
- "Notion MCP unreachable" → "Supabase MCP unreachable"
- Field names in the Delta-mode table updated to snake_case Supabase columns
- Step descriptions updated to reference the right tables (`sources`, `evidence`, `projects`, `decision_items`, `knowledge_assets`)

Mechanical rewrite.

### 8. plan-master-agent
Already Supabase-native for `strategic_objectives` / `objective_artifacts` / `artifact_versions` / `artifact_questions`. Step 3 was the only Notion-leaking part:
| Original | New |
|---|---|
| `notion-fetch` for linked projects | `execute_sql … from projects where id = any(:linked_projects)` |
| `notion-query-database-view` for CH Evidence [OS v2] | `execute_sql … from evidence where project_id = …` |
| `notion-search` for CH Knowledge Assets [OS v2] | `execute_sql … from knowledge_assets where title ilike …` |

Mechanical rewrite.

### 9. review-queue
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Evidence [OS v2] | `evidence` |
| CH Projects [OS v2] | `projects` |
| Knowledge proposals (from update-knowledge-asset) | `knowledge_assets` (target of proposed deltas) |

Property→column rename (`Validation Status`, `Project Update Needed?`, `Draft Status Update`, `Reusability Level`, `Evidence Type`, `Date Captured`, `Last Status Update`, `Project Status`, `Current Stage`). Read-only. Mechanical rewrite.

### 10. source-intake
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Sources [OS v2] | `sources` |
| CH Organizations [OS v2] | `organizations` |
| CH People [OS v2] | `people` |
| CH Projects [OS v2] | `projects` |
| CH Decision Items [OS v2] | `decision_items` |

The original used Notion property markers in `Proposed Action` rich text (`[ENTITY_ACTION:create_org]`, `[ORG_NAME:…]`, etc.) parsed by the Decision Center. The rewrite replaces the markers with structured `entity_action` text + `entity_payload` jsonb columns on `decision_items`. **NEW columns flagged below** — see "Columns the freeze doc didn't fully spec" section.

### 11. update-knowledge-asset
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Evidence [OS v2] | `evidence` |
| CH Knowledge Assets [OS v2] (`0f4bfe95…9b04`) | `knowledge_assets` (NEW — per freeze §3.1; distinct from `knowledge_nodes`) |

Property→column rename. Output is proposals only — no auto-writes — so column-level write surface is small. Mechanical rewrite.

### 12. validation-operator
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Evidence [OS v2] | `evidence` |
| CH Decision Items [OS v2] | `decision_items` |

`notion-update-page` with `update_properties: {"Validation Status": "Validated"}` → `update evidence set validation_status = 'Validated' where id = :id`. Mechanical rewrite.

### 13. update-project-status
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Projects [OS v2] | `projects` |
| CH Evidence [OS v2] | `evidence` |

`Draft Status Update` → `draft_status_update`. `Status Summary` → `status_summary` (preserved as human-owned; agent never writes). `Project Update Needed?` → `project_update_needed` (boolean). `Last Status Update` → `last_status_update` (date). Mechanical rewrite — depends on Phase 1 schema migration adding these columns to `projects` (see freeze §3.1).

### 14. project-operator
| Notion DB referenced | Supabase replacement |
|---|---|
| CH Projects [OS v2] | `projects` |
| CH Evidence [OS v2] | `evidence` |

Same column renames as update-project-status. Mechanical rewrite.

---

## Mechanical-rewrite vs. design-decision classification

### Mechanical (12 of 14)
These need only schema-name substitution and SQL where Notion API calls were used. No design decisions required from Jose:

1. briefing-agent
2. db-hygiene-operator
3. deal-flow-agent
4. evidence-review
5. hygiene-agent
6. knowledge-curator (effectively a no-op rewrite — already Supabase)
7. os-runner
8. plan-master-agent
9. review-queue
10. update-knowledge-asset
11. validation-operator
12. update-project-status / project-operator (paired — same column set)

### Needs a design decision from Jose (2 of 14)

**source-intake** — the original encodes entity-creation proposals as marker tokens inside a Notion rich-text `Proposed Action` field (`[ENTITY_ACTION:create_org][ORG_NAME:…][ORG_DOMAIN:…][CONTACT_EMAIL:…]`). The Decision Center parses these markers to pre-fill the approval form. The rewrite proposes replacing this with structured columns on `decision_items`:
- `entity_action text` — `'create_org'` | `'create_person'`
- `entity_payload jsonb` — structured payload
- `resolution_target_table text` — for relation-resolution items

**Decision needed:** confirm that the Phase 1 migration on `decision_items` will add these columns, and that the Decision Center UI will be updated to read them instead of parsing markers. If Jose prefers the marker approach to ride out cutoff, the rewrite must fall back to free-text `proposed_action` with the same marker syntax.

**hygiene-agent** — references `automations` table writes (`human_override_needed`, `notes` append) without a clear freeze-doc entry for `automations`. The freeze doc §3 does not list `automations` in any of the mappings — it is presumed pre-existing in Supabase per the `automation-health-review` skill, but **this is an assumption, not a confirmed schema row**. Confirm `automations` exists with the expected columns before relying on this rewrite.

---

## Columns the freeze doc didn't fully spec

The freeze doc names the canonical tables and a few key columns (`relationship_classes`, `engagement_type`, `status_summary`, `draft_status_update`, `stage`, `legacy_notion_id`), but the full column-level contract for each table is not in §3. The rewrites assume the following columns exist (or will be added in Phase 1):

### `decision_items` (NEW canonical, replaces `notion_decision_items`)
- `name text`
- `decision_type text` — enum: `Approval`, `Missing Input`, `Ambiguity Resolution`, etc.
- `priority text` — enum: `Low`, `Medium`, `High`, `P1 Critical`
- `status text` — enum: `Open`, `Resolved`, `Dismissed`
- `source_agent text`
- `proposed_action text`
- `entity_id uuid` — pointer to the affected row (any table)
- `entity_table text` — `'evidence' | 'organizations' | 'people' | 'sources' | 'projects' | …`
- `resolution_field text` — column name on the target row that the resolution will set
- `resolution_type text` — `'text' | 'select' | 'relation' | …`
- `resolution_target_table text` — for relation-resolution items (e.g. `'projects'`)
- **NEW (proposed)** `entity_action text` — `'create_org' | 'create_person'` for source-intake creation proposals
- **NEW (proposed)** `entity_payload jsonb` — structured payload for entity-creation proposals

### `projects` additions (per freeze §3.1)
- `status_summary text` — human-owned narrative
- `draft_status_update text` — agent-owned incremental draft
- `stage text` — human-owned
- `project_update_needed boolean` — agent-owned flag (the original Notion field had a `__YES__` literal; rewrite uses boolean)
- `last_status_update date`

### `sources` additions (mostly already exist, confirm)
- `processing_status text`, `relevance_status text`, `dedup_key text`, `thread_id text`, `processed_summary text`, `sanitized_notes text`, `sensitivity text`, `linked_project_ids uuid[]`, `linked_organization_ids uuid[]`, `evidence_extracted boolean`, `last_source_update timestamptz`

### `evidence` additions (most already canonical per freeze; confirm)
- `stakeholder_function text` (used heavily by knowledge-curator and evidence-review)
- `affected_theme text[]`
- `topics text[]`
- `geography text` (referenced by knowledge-curator)
- `people_involved uuid[]`

### `organizations` additions
- `legacy_record_url text` (used by hygiene-agent for provenance marks)
- `notes text` (used heavily by deal-flow-agent and hygiene-agent)

### `people` additions
- `legacy_record_url text`
- `primary_organization_id uuid`

### `automations` (presumed pre-existing — confirm)
- `human_override_needed boolean`
- `health text`, `status text`, `owner text`, `last_reviewed_at timestamptz`, `review_cadence text`, `notes text`

### `knowledge_assets` (NEW per freeze §3.4)
- `title text`, `body text`, `asset_type text`, `affected_theme text[]`, `topics text[]`, columns to support delta proposals from update-knowledge-asset

**Action:** before Phase 4 (API migration) runs, the Phase 1 schema migration must lock these columns. Anything still uncertain at that point is a design decision for Jose.

---

## Behaviors that genuinely cannot be preserved without redesign

**None of the 14 agents has a behavior that breaks under the Supabase model.** Every contract — gates, classifications, escalation queues, P1 surfacing, dry_run/execute split, human gates — translates 1:1 to the Supabase schema as long as the columns above are added in Phase 1.

The single soft caveat:

- **source-intake's marker-token convention** in Notion's `Proposed Action` rich text was a workaround for not having structured columns. The rewrite proposes upgrading this to structured `entity_action` + `entity_payload jsonb` columns. This is a *redesign opportunity*, not a forced break. If the Decision Center is not also updated, the rewrite must keep the markers in a free-text `proposed_action` column. Either path works; pick one.

No other behavior is at risk.

---

## Drafts checklist

Each draft begins with a `> **Migrated 2026-05-XX**` note. Verify in review:

- [ ] briefing-agent.md
- [ ] db-hygiene-operator.md
- [ ] deal-flow-agent.md
- [ ] evidence-review.md
- [ ] hygiene-agent.md
- [ ] knowledge-curator.md
- [ ] os-runner.md
- [ ] plan-master-agent.md
- [ ] project-operator.md
- [ ] review-queue.md
- [ ] source-intake.md
- [ ] update-knowledge-asset.md
- [ ] update-project-status.md
- [ ] validation-operator.md

Originals remain untouched at `.claude/agents/*.md`. Move/replace only after Jose's review and after Phase 1 schema migration is confirmed in production.
