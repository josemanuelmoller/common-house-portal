-- ============================================================
-- Loop Engine — Supabase DDL
-- Migration Wave 2: loops, loop_signals, loop_actions
--
-- Run this in the Supabase SQL editor for project rjcsasbaxihaubkkkxrt
-- if the tables do not yet exist, or to verify the live schema matches.
--
-- These tables are synced from three Notion sources via POST /api/sync-loops
-- (cron: 0 8 * * 1-5). They are read by GET /api/cos-loops for the
-- Chief of Staff Desk in /admin.
--
-- Source of truth for types: src/lib/loops.ts
-- ============================================================

-- ── loops ────────────────────────────────────────────────────────────────────
-- One row per unresolved executive issue.
-- Deduped by normalized_key (stable across re-syncs).

CREATE TABLE IF NOT EXISTS loops (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_key     TEXT        UNIQUE NOT NULL,
  -- Format: {entity_type}:{notion_page_id}[:{variant}]
  -- Examples:
  --   evidence:abc123
  --   opportunity:abc123:pending
  --   opportunity:abc123:followup
  --   opportunity:abc123:new
  --   opportunity:abc123:review
  --   opportunity:abc123:active
  --   project:abc123:obstacle

  title              TEXT        NOT NULL,
  loop_type          TEXT        NOT NULL
    CHECK (loop_type IN ('blocker','commitment','decision','prep','review','follow_up')),
  status             TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','waiting','resolved','dismissed','reopened')),

  -- Semantic identity (survives Notion page churn). Same underlying issue
  -- re-created under a new Notion page_id resolves to the same intent_key
  -- and must NOT create a fresh loop.
  intent_key                  TEXT,

  -- Lineage (first loop in family). Preserved across resolves & reopens.
  lineage_id                  UUID,
  parent_loop_id              UUID REFERENCES loops(id) ON DELETE SET NULL,

  -- Lifecycle timestamps
  resolved_at                 TIMESTAMPTZ,
  dismissed_at                TIMESTAMPTZ,
  reopened_at                 TIMESTAMPTZ,
  reopen_count                INTEGER NOT NULL DEFAULT 0,

  -- Materially-new-evidence gate state
  last_meaningful_evidence_at TIMESTAMPTZ,
  last_evidence_fingerprint   TEXT,

  intervention_moment TEXT       NOT NULL
    CHECK (intervention_moment IN ('urgent','next_meeting','email_this_week','review_this_week','this_week')),
  priority_score     INTEGER     NOT NULL DEFAULT 0
    CHECK (priority_score >= 0 AND priority_score <= 100),

  linked_entity_type TEXT        NOT NULL
    CHECK (linked_entity_type IN ('evidence','opportunity','project')),
  linked_entity_id   TEXT        NOT NULL,   -- Notion page ID of the source record
  linked_entity_name TEXT        NOT NULL,   -- Human-readable name for display

  -- Source-of-origin enrichment. Populated at sync time so every surfaced
  -- loop can name the project / org it relates to without extra lookups.
  --   parent_project_id   — Notion page ID of the related project, or NULL
  --   parent_project_name — display name of that project at sync time
  --   org_name            — organization / account name (opportunities only)
  parent_project_id   TEXT,
  parent_project_name TEXT,
  org_name            TEXT,

  notion_url         TEXT        NOT NULL DEFAULT '',
  review_url         TEXT,                   -- NULL or document/email URL for review loops

  due_at             TIMESTAMPTZ,            -- ISO timestamp; NULL if no deadline

  signal_count       INTEGER     NOT NULL DEFAULT 0,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_action_at     TIMESTAMPTZ,            -- Last user action (status change)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── loop_signals ─────────────────────────────────────────────────────────────
-- One row per corroborating signal per loop.
-- Unique constraint (loop_id, signal_type, source_id) prevents double-counting.

CREATE TABLE IF NOT EXISTS loop_signals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id        UUID        NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
  signal_type    TEXT        NOT NULL
    CHECK (signal_type IN ('evidence_blocker','evidence_commitment','project_obstacle','opportunity_signal','manual')),
  source_id      TEXT        NOT NULL,   -- Notion page ID of the signal source
  source_name    TEXT        NOT NULL,   -- Human label (opportunity name, evidence title, etc.)
  source_excerpt TEXT,                   -- Short excerpt (≤500 chars); NULL if not available
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (loop_id, signal_type, source_id)
);

-- ── loop_actions ─────────────────────────────────────────────────────────────
-- Append-only audit log. One row per status transition or human action.

CREATE TABLE IF NOT EXISTS loop_actions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id     UUID        NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
  action_type TEXT        NOT NULL
    CHECK (action_type IN (
      'created','updated','marked_in_progress','marked_waiting','resolved','dismissed',
      'reopened','raised_in_meeting','email_sent','reviewed','decision_made'
    )),
  note        TEXT,       -- Optional human note or system annotation
  actor       TEXT        NOT NULL DEFAULT 'system',  -- 'system' | 'jose' | agent name
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes ───────────────────────────────────────────────────────────────────
-- Optimized for the primary query in GET /api/cos-loops:
--   SELECT * FROM loops WHERE status IN ('open','in_progress')
--   ORDER BY priority_score DESC, first_seen_at ASC LIMIT 50

CREATE INDEX IF NOT EXISTS loops_status_score_idx
  ON loops(status, priority_score DESC, first_seen_at ASC);

CREATE INDEX IF NOT EXISTS loops_normalized_key_idx
  ON loops(normalized_key);

CREATE INDEX IF NOT EXISTS loops_intent_key_idx
  ON loops(intent_key);

CREATE INDEX IF NOT EXISTS loops_lineage_id_idx
  ON loops(lineage_id);

CREATE INDEX IF NOT EXISTS loops_resolved_at_idx
  ON loops(resolved_at) WHERE resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS loops_dismissed_at_idx
  ON loops(dismissed_at) WHERE dismissed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS loops_linked_entity_idx
  ON loops(linked_entity_type, linked_entity_id);

CREATE INDEX IF NOT EXISTS loops_parent_project_idx
  ON loops(parent_project_id) WHERE parent_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS loop_signals_loop_id_idx
  ON loop_signals(loop_id);

CREATE INDEX IF NOT EXISTS loop_actions_loop_id_idx
  ON loop_actions(loop_id, created_at DESC);
