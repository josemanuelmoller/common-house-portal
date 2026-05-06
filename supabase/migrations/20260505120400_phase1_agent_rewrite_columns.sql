-- Phase 1.5 — Column gaps surfaced by Phase 3 agent rewrite drafts.
-- See docs/migration/PHASE_3_AGENT_REWRITES.md "Columns the freeze doc didn't fully spec".

-- decision_items: structured entity-creation proposals (replaces the marker-token
-- syntax used by source-intake when writing to Notion rich-text).
ALTER TABLE public.decision_items ADD COLUMN IF NOT EXISTS entity_action text;
ALTER TABLE public.decision_items ADD COLUMN IF NOT EXISTS entity_payload jsonb;
-- decision_items: generic resolution target (which row/field a decision resolves).
ALTER TABLE public.decision_items ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE public.decision_items ADD COLUMN IF NOT EXISTS entity_table text;
ALTER TABLE public.decision_items ADD COLUMN IF NOT EXISTS resolution_field text;
ALTER TABLE public.decision_items ADD COLUMN IF NOT EXISTS resolution_type text;
ALTER TABLE public.decision_items ADD COLUMN IF NOT EXISTS resolution_target_table text;

-- evidence: array of person FKs (replaces a Notion relation property).
ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS people_involved uuid[];
CREATE INDEX IF NOT EXISTS idx_evidence_people_involved
  ON public.evidence USING GIN(people_involved);

-- organizations / people: preserve the legacy Notion URL for audit/traceability
-- (notes already exists on organizations).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS legacy_record_url text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS legacy_record_url text;
