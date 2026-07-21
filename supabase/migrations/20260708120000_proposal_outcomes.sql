-- proposal_outcomes — the human feedback loop on agent-produced proposals.
--
-- Every approval endpoint (approve-and-send-draft, approve-pitch, update-draft,
-- agent-drafts/dismiss, ...) records the human decision here so we can:
--   1. Compute acceptance rate per agent (/admin/control-plane).
--   2. Feed past corrections back into generation (skills read their own
--      rejections/edits before drafting again).
--
-- Designed in Phase 1.2 (commit 85a21fc, 2026-05-05): src/lib/proposal-outcomes.ts
-- writes here and /admin/control-plane reads here — but the table itself was
-- never migrated, so every write was a silent no-op and the dashboard errored.
-- This migration ships the table those callers have always assumed exists.
--
-- Contract (must match src/lib/proposal-outcomes.ts ProposalOutcomeInput and the
-- reads in src/app/admin/control-plane/page.tsx):
--   - action / proposal_type enums mirror the TS unions exactly.
--   - decided_at defaults to now(); control-plane filters `gte("decided_at", …)`.
--
-- RLS: enabled with no policies. Server uses SUPABASE_SERVICE_KEY which bypasses
-- RLS (same pattern as inbox_items).

CREATE TABLE IF NOT EXISTS public.proposal_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- What was decided on
  proposal_type text NOT NULL,
  proposal_id   text NOT NULL,
  proposal_title text,

  -- The human decision
  action text NOT NULL,

  -- Who / which generator
  agent_name  text,
  actor_email text,

  -- Learning signal
  edit_summary text,   -- 1-line summary of what changed (action='edited')
  reason       text,   -- free-text rejection reason (action='rejected'/'revision_requested')
  metadata     jsonb,  -- e.g. { old_body, new_body } for edits — the actual diff

  CONSTRAINT proposal_outcomes_type_chk CHECK (
    proposal_type IN (
      'agent_draft', 'content_pitch', 'project_update',
      'decision_item', 'objective_artifact'
    )
  ),
  CONSTRAINT proposal_outcomes_action_chk CHECK (
    action IN (
      'approved', 'edited', 'rejected',
      'skipped', 'revision_requested', 'sent'
    )
  )
);

-- control-plane: rolling 7-day window, newest first.
CREATE INDEX IF NOT EXISTS proposal_outcomes_decided_idx
  ON public.proposal_outcomes (decided_at DESC);

-- Acceptance rate per agent, and "what did agent X get rejected on" lookups
-- when a skill reads its own history before regenerating.
CREATE INDEX IF NOT EXISTS proposal_outcomes_agent_idx
  ON public.proposal_outcomes (agent_name, decided_at DESC);

-- "Show me every decision on this specific proposal" lookups.
CREATE INDEX IF NOT EXISTS proposal_outcomes_proposal_idx
  ON public.proposal_outcomes (proposal_type, proposal_id);

ALTER TABLE public.proposal_outcomes ENABLE ROW LEVEL SECURITY;
