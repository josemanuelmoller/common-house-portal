-- Restore the UNIQUE constraint on daily_briefings.briefing_date.
--
-- Required by the upsert in /api/generate-daily-briefing
-- (.upsert({...}, { onConflict: "briefing_date" })).
--
-- The Phase 1 canonical_tables migration (2026-05-05) recreated the
-- daily_briefings table without this constraint, breaking every
-- daily-briefing run since: every cron returned HTTP 500 with
-- "there is no unique or exclusion constraint matching the
--  ON CONFLICT specification". The Hall stopped getting fresh briefings.
--
-- Applied via MCP on 2026-05-06 14:32 UTC; this file documents the change
-- so repo and prod stay in sync.
ALTER TABLE public.daily_briefings
  ADD CONSTRAINT daily_briefings_briefing_date_key UNIQUE (briefing_date);
