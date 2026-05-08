-- Phase 6 (pre-cutoff 2026-06-02) — drop the Notion mirror tables.
--
-- Background: pre-2026-05-05 the codebase wrote to mirror tables (with a
-- pending_notion_push payload) and a cron drained pushes back to Notion.
-- That pattern was rejected (see docs/migration/REJECTED_PATTERNS.md R-001)
-- and the canonical replacements live as first-class Supabase tables:
--
--   notion_decision_items     →  decision_items
--   notion_daily_briefings    →  daily_briefings
--   notion_insight_briefs     →  insight_briefs
--   notion_competitive_intel  →  competitive_intel
--   notion_agent_drafts       →  agent_drafts
--   notion_content_pipeline   →  content_pipeline_items
--   notion_watchlist          →  watchlist_entities
--   notion_sync_runs          →  (no canonical replacement; audit table only)
--
-- All write paths to these mirror tables were retired in commit
-- 20260508 (canonical-write.ts shim + 11 caller migrations), and the cron
-- that synced Notion → mirror (`/api/cron/sync-notion-mirror`) plus the
-- cron that drained pending pushes back to Notion
-- (`/api/cron/push-pending-to-notion`) were deleted in the same commit.
--
-- Read paths from `src/lib/notion-mirror.ts` (consumed by `notion-cached.ts`
-- and the Hall) are NOT yet migrated to the canonical tables. Applying this
-- migration WILL break those reads. Do not apply until either:
--
--   (a) the read paths in notion-mirror.ts have been ported to the
--       corresponding canonical tables, or
--   (b) the mirror reads have been replaced with empty stubs (acceptable
--       transitional state for the last days before 2026-06-02 cutoff).
--
-- This file is intentionally checked in unapplied so the owner can review
-- and choose the moment to apply via `mcp__supabase__apply_migration` (or
-- the Supabase CLI). It is NOT part of any automated migration run.

-- ─── Drop mirror tables (with CASCADE for dependent FKs) ────────────────────

DROP TABLE IF EXISTS public.notion_decision_items     CASCADE;
DROP TABLE IF EXISTS public.notion_daily_briefings    CASCADE;
DROP TABLE IF EXISTS public.notion_insight_briefs     CASCADE;
DROP TABLE IF EXISTS public.notion_competitive_intel  CASCADE;
DROP TABLE IF EXISTS public.notion_agent_drafts       CASCADE;
DROP TABLE IF EXISTS public.notion_content_pipeline   CASCADE;
DROP TABLE IF EXISTS public.notion_watchlist          CASCADE;
DROP TABLE IF EXISTS public.notion_sync_runs          CASCADE;
