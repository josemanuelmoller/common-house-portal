-- BLK-0 — Decisiones de la sala.
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-24 (recorded version 20260724083407, name blk0_project_decisions)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. Every statement
-- is guarded, so re-running is safe.
--
-- Depends on 20260724061309_blk0_work_execution_layer.sql for both
-- public.project_deliverables and public.tg_set_updated_at().

-- Decisiones de la sala. Ancladas a un entregable (opcional), con contexto y participantes.
CREATE TABLE IF NOT EXISTS public.project_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  deliverable_id uuid REFERENCES public.project_deliverables(id) ON DELETE SET NULL,  -- entregable que afecta
  title text NOT NULL,
  context text,                     -- por qué importa / opciones
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  participants jsonb,               -- [{initials, name, side}] quién estuvo
  source_ref text,                  -- reunión/correo de origen
  resolved_by text,
  resolved_at timestamptz,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.project_decisions IS 'Decisiones de la sala, ancladas a un entregable + contexto + participantes. Resolver: PM/colaborador o el cliente si le corresponde.';
CREATE INDEX IF NOT EXISTS idx_decisions_project ON public.project_decisions(project_id, position);
CREATE INDEX IF NOT EXISTS idx_decisions_deliverable ON public.project_decisions(deliverable_id) WHERE deliverable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decisions_open ON public.project_decisions(project_id) WHERE status = 'open';
ALTER TABLE public.project_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_decisions') THEN
    CREATE TRIGGER set_updated_at_decisions BEFORE UPDATE ON public.project_decisions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at(); END IF;
END $$;
