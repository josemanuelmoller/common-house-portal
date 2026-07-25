-- Freeze acceptance criterion #7: zero rls_disabled on public.*
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-21 (recorded version 20260721104013, name enable_rls_on_six_exposed_tables)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. The file is
-- written here so the repo can reproduce prod from scratch; ENABLE ROW LEVEL
-- SECURITY is a no-op when already enabled, so re-running is safe.

-- These 6 tables are accessed only server-side via the service role
-- (service_role bypasses RLS). No anon/authenticated client reads them,
-- so ENABLE RLS with no permissive policy = anon/authenticated get nothing,
-- service role keeps full access. Matches every other service-role table here.
ALTER TABLE public.hall_attention_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_recent_topics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_snoozes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_snoozes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_draft_dismissals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debug_log              ENABLE ROW LEVEL SECURITY;
