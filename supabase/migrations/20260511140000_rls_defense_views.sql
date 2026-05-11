-- Wave 5 H4: the Wave 2.5 migration used pg_tables which only lists base
-- tables — 5 views remained with full anon + authenticated grants. RLS does
-- not apply to views, so those grants were a live read/write surface for
-- any anon-key client.

DO $$
DECLARE
  vw text;
BEGIN
  FOR vw IN
    SELECT viewname FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', vw);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', vw);
  END LOOP;
END $$;

DO $$
DECLARE
  mv text;
BEGIN
  FOR mv IN
    SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', mv);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', mv);
  END LOOP;
END $$;
