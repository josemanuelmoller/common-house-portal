-- Wave 2.5 — RLS defense-in-depth.
--
-- The audit found that 87 of 90 Supabase tables have RLS enabled but no
-- policies attached, meaning anon and authenticated roles get DENY by default.
-- Today the app is safe only because no client-side code imports
-- @supabase/supabase-js with the anon key — but a single future import would
-- expose every table to anon attempts.
--
-- This migration adds an explicit REVOKE so even if RLS were accidentally
-- disabled on a table (e.g. via the Supabase Studio UI), anon/authenticated
-- would still be denied. The service_role bypasses RLS regardless and keeps
-- working as before.
--
-- We do NOT add USING-clause policies here because there are no use cases
-- yet for letting end-users read data directly. When such a use case appears,
-- add a granular policy alongside (or instead of) this revoke.

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'auth_%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', tbl);
  END LOOP;
END $$;

-- Future tables: enforce the same posture by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
