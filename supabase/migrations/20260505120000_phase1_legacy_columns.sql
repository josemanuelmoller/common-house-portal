-- Phase 1.1 — Legacy ID columns and canonical column additions
-- See docs/SUPABASE_CONSOLIDATION_FREEZE.md
-- Idempotent: safe to re-apply.

-- ─── organizations ───────────────────────────────────────────────────────────
ALTER TABLE public.organizations ALTER COLUMN notion_id DROP NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS legacy_notion_id text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS legacy_source_db text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS relationship_classes text[];
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS engagement_type text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS engagement_value numeric;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS engagement_status text;
CREATE INDEX IF NOT EXISTS idx_organizations_legacy_notion_id
  ON public.organizations(legacy_notion_id)
  WHERE legacy_notion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_relationship_classes
  ON public.organizations USING GIN(relationship_classes);

-- ─── projects ────────────────────────────────────────────────────────────────
ALTER TABLE public.projects ALTER COLUMN notion_id DROP NOT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS legacy_notion_id text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS legacy_source_db text;
CREATE INDEX IF NOT EXISTS idx_projects_legacy_notion_id
  ON public.projects(legacy_notion_id)
  WHERE legacy_notion_id IS NOT NULL;

-- ─── evidence ────────────────────────────────────────────────────────────────
ALTER TABLE public.evidence ALTER COLUMN notion_id DROP NOT NULL;
ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS legacy_notion_id text;
ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS legacy_source_db text;
CREATE INDEX IF NOT EXISTS idx_evidence_legacy_notion_id
  ON public.evidence(legacy_notion_id)
  WHERE legacy_notion_id IS NOT NULL;

-- ─── sources ─────────────────────────────────────────────────────────────────
ALTER TABLE public.sources ALTER COLUMN notion_id DROP NOT NULL;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS legacy_notion_id text;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS legacy_source_db text;
CREATE INDEX IF NOT EXISTS idx_sources_legacy_notion_id
  ON public.sources(legacy_notion_id)
  WHERE legacy_notion_id IS NOT NULL;

-- ─── people ──────────────────────────────────────────────────────────────────
-- notion_id is already nullable on people
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS legacy_notion_id text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS legacy_source_db text;
CREATE INDEX IF NOT EXISTS idx_people_legacy_notion_id
  ON public.people(legacy_notion_id)
  WHERE legacy_notion_id IS NOT NULL;

-- ─── opportunities ───────────────────────────────────────────────────────────
ALTER TABLE public.opportunities ALTER COLUMN notion_id DROP NOT NULL;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS legacy_notion_id text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS legacy_source_db text;
CREATE INDEX IF NOT EXISTS idx_opportunities_legacy_notion_id
  ON public.opportunities(legacy_notion_id)
  WHERE legacy_notion_id IS NOT NULL;
