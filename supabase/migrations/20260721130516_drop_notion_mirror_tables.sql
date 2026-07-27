-- Freeze §3.6 — the Notion mirror layer is dropped.
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-21 (recorded version 20260721130516, name drop_notion_mirror_tables)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. All 8 drops use
-- IF EXISTS, so re-running is safe.
--
-- NOTE: this is the Phase 6 mirror-table DROP that AGENTS.md §4 (notion-cutoff)
-- announced as "slated for DROP at Phase 6". It has already happened. New code
-- must read/write the canonical replacements (decision_items, daily_briefings,
-- insight_briefs, watchlist, competitive_intel, agent_drafts, content_pipeline,
-- sync_runs).

-- Freeze §3.6: drop the mirror layer now that canonical tables are the sole
-- read/write source and no code references notion_* (verified). Irreversible;
-- owner-approved 2026-07-21.
DROP TABLE IF EXISTS public.notion_decision_items;
DROP TABLE IF EXISTS public.notion_daily_briefings;
DROP TABLE IF EXISTS public.notion_insight_briefs;
DROP TABLE IF EXISTS public.notion_watchlist;
DROP TABLE IF EXISTS public.notion_competitive_intel;
DROP TABLE IF EXISTS public.notion_agent_drafts;
DROP TABLE IF EXISTS public.notion_content_pipeline;
DROP TABLE IF EXISTS public.notion_sync_runs;
