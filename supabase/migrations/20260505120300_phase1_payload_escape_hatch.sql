-- Phase 1.4 — payload jsonb escape hatch for the Phase 2 backfill.
-- The backfill's generic mapper writes the full Notion property bag here for
-- tables whose column-bound mapper is not yet finalised. Phase 4 work
-- replaces this with proper columns. Phase 6 drops `payload`.

ALTER TABLE public.decision_items         ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.knowledge_assets       ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.engagements            ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.proposal_briefs        ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.offers                 ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.grant_sources          ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.valuations             ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.cap_table_entries      ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.data_room_documents    ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.financial_snapshots    ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.insight_briefs         ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.content_pipeline_items ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.style_profiles         ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.agent_drafts           ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.daily_briefings        ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.watchlist_entities     ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.competitive_intel      ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.conversations          ADD COLUMN IF NOT EXISTS payload jsonb;
