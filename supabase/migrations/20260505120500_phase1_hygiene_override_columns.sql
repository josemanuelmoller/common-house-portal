-- Phase 1.6 — Hygiene-agent override flags (Option B from freeze §10.2).
-- Read source: routine_latest_runs (unchanged).
-- Write target: agent_health_diagnoses extended with override columns.
-- The hygiene-agent inserts/updates rows here keyed by (cluster_key, routine_name).
-- Rows that are pure override flags use classification='override_flag'.

ALTER TABLE public.agent_health_diagnoses
  ADD COLUMN IF NOT EXISTS human_override_needed boolean NOT NULL DEFAULT false;
ALTER TABLE public.agent_health_diagnoses
  ADD COLUMN IF NOT EXISTS override_notes text;
ALTER TABLE public.agent_health_diagnoses
  ADD COLUMN IF NOT EXISTS override_set_at timestamptz;
ALTER TABLE public.agent_health_diagnoses
  ADD COLUMN IF NOT EXISTS override_set_by text;

-- Partial index — hygiene-agent reads "everything currently flagged" frequently.
CREATE INDEX IF NOT EXISTS idx_agent_health_override_needed
  ON public.agent_health_diagnoses(routine_name, override_set_at DESC)
  WHERE human_override_needed = true;
