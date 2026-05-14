-- Reconnect evidence -> sources with a stable uuid FK.
--
-- The pipeline previously joined evidence to its source on the text column
-- evidence.source_notion_id == sources.notion_id. That join broke when Notion
-- writes were turned off (~2026-05-06 cutoff): sources.notion_id is now NULL
-- for 100+ rows (all recent Gmail + Fireflies sources). As a result the
-- Fireflies action-item ingestor read 0 rows every run and the Hall
-- "Commitments" surface froze.
--
-- Fix: a real uuid FK (evidence.source_id -> sources.id) that does not depend
-- on Notion identifiers at all. Additive only -- source_notion_id is retained
-- for any remaining legacy consumers.

-- 1. Stable FK column on evidence.
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS source_id uuid
  REFERENCES public.sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_source_id
  ON public.evidence(source_id);

-- 2. Make source_external_id a usable idempotent upsert key. This is the
--    Fireflies transcript ULID / Gmail thread id -- always present for
--    machine-ingested sources, unlike notion_id. Partial unique index so
--    legacy rows without an external id are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS sources_source_external_id_key
  ON public.sources(source_external_id)
  WHERE source_external_id IS NOT NULL;
