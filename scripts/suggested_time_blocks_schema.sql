-- ============================================================
-- Suggested Time Blocks — Supabase DDL
--
-- Run in the Supabase SQL editor for project rjcsasbaxihaubkkkxrt.
-- One row per suggestion. Produced by /api/suggested-time-blocks (GET),
-- updated by accept/dismiss/snooze endpoints.
-- ============================================================

CREATE TABLE IF NOT EXISTS suggested_time_blocks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  user_email            TEXT        NOT NULL,                 -- Clerk primary email
  title                 TEXT        NOT NULL,                 -- specific action sentence
  linked_entity_type    TEXT        NOT NULL
    CHECK (linked_entity_type IN ('loop','opportunity','project','meeting_prep','meeting_follow_up')),
  linked_entity_id      TEXT        NOT NULL,                 -- stable id from source
  linked_entity_label   TEXT        NOT NULL,                 -- human-readable label shown in UI

  -- Time proposal
  suggested_start_time  TIMESTAMPTZ NOT NULL,
  suggested_end_time    TIMESTAMPTZ NOT NULL,
  duration_minutes      INTEGER     NOT NULL
    CHECK (duration_minutes > 0 AND duration_minutes <= 240),

  -- Classification
  task_type             TEXT        NOT NULL
    CHECK (task_type IN ('deep_work','follow_up','prep','decision','admin')),
  urgency_score         INTEGER     NOT NULL DEFAULT 0
    CHECK (urgency_score >= 0 AND urgency_score <= 100),
  confidence_score      INTEGER     NOT NULL DEFAULT 50
    CHECK (confidence_score >= 0 AND confidence_score <= 100),

  -- Reasoning (shown in UI verbatim; must be specific, not generic)
  why_now               TEXT        NOT NULL,
  expected_outcome      TEXT        NOT NULL,

  -- Dedup: stable fingerprint so the same candidate isn't re-suggested within
  -- a short window. Format: {entity_type}:{entity_id}:{task_type}.
  fingerprint           TEXT        NOT NULL,

  -- Lifecycle
  status                TEXT        NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','accepted','dismissed','snoozed','expired')),
  accepted_at           TIMESTAMPTZ,
  dismissed_at          TIMESTAMPTZ,
  snoozed_until         TIMESTAMPTZ,

  -- If accepted, we store the Google Calendar event id we created so the user
  -- can navigate straight to it or we can remove it on undo.
  gcal_event_id         TEXT,
  gcal_event_link       TEXT,

  -- Audit
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stb_user_status       ON suggested_time_blocks (user_email, status);
CREATE INDEX IF NOT EXISTS idx_stb_user_generated_at ON suggested_time_blocks (user_email, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stb_fingerprint       ON suggested_time_blocks (user_email, fingerprint);
CREATE INDEX IF NOT EXISTS idx_stb_start_time        ON suggested_time_blocks (suggested_start_time);

-- Keep updated_at fresh on any write
CREATE OR REPLACE FUNCTION stb_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stb_touch_trigger ON suggested_time_blocks;
CREATE TRIGGER stb_touch_trigger
  BEFORE UPDATE ON suggested_time_blocks
  FOR EACH ROW EXECUTE FUNCTION stb_touch_updated_at();
