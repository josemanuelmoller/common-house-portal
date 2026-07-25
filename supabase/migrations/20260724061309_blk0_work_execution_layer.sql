-- BLK-0 — Capa de ejecución de la sala de trabajo.
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-24 (recorded version 20260724061309, name blk0_work_execution_layer)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. Every statement
-- is guarded (IF NOT EXISTS / CREATE OR REPLACE / DO-block trigger guards), so
-- re-running is safe.
--
-- This is the migration that introduces public.tg_set_updated_at(), which
-- 20260724083407_blk0_project_decisions.sql depends on.

-- Bloque 0 — Capa de ejecución de la sala de trabajo (post-venta).
-- Aditivo: 5 tablas nuevas. No toca datos ni tablas existentes.
-- RLS on / sin policies, igual que el baseline (portal usa service-key; roles se enforce en la capa de app).
-- Diseño: memoria project_work_room_design + project_work_room_roles.

-- ─── project_members — membresía + rol POR SALA (backbone de la matriz de permisos) ───
-- Roles: pm > collaborator > client > reader. Scope: una persona ve solo salas donde tiene fila activa.
-- Complementa client_access (que es Clerk-email → project solo para clientes).
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,   -- equipo CH / personas conocidas
  user_email text,                                                 -- Clerk email (cliente/externo sin fila en people)
  role text NOT NULL CHECK (role IN ('pm','collaborator','client','reader')),
  invited_by text,
  revoked_at timestamptz,                                          -- NULL = activo
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.project_members IS 'Membresía y rol por sala (pm/collaborator/client/reader). Base de la matriz de permisos; el scope de "salas visibles" sale de acá. Complementa client_access.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_members_person ON public.project_members(project_id, person_id) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_members_email ON public.project_members(project_id, user_email) WHERE user_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_members_email ON public.project_members(lower(user_email)) WHERE user_email IS NOT NULL AND revoked_at IS NULL;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ─── project_phases — fases del programa (acordeón del Plan, con ✓) ───
CREATE TABLE IF NOT EXISTS public.project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','in_progress','done')),
  position int NOT NULL DEFAULT 0,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.project_phases IS 'Fases de una sala de trabajo. done = cumplida (muestra check). Estructural: crear/editar = PM directo, colaborador sugiere.';
CREATE INDEX IF NOT EXISTS idx_project_phases_project ON public.project_phases(project_id, position);
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

-- ─── project_deliverables — entregables ───
CREATE TABLE IF NOT EXISTS public.project_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.project_phases(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','at_risk','delivered','accepted')),
  owner_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  due_date date,
  progress int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  accepted_at timestamptz,          -- sign-off del cliente
  accepted_by text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.project_deliverables IS 'Entregables de la sala. accepted_* = visto bueno del cliente. Kanban por status. Estructural (crear/borrar) = PM directo / colaborador sugiere.';
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON public.project_deliverables(project_id, position);
CREATE INDEX IF NOT EXISTS idx_deliverables_phase ON public.project_deliverables(phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliverables_owner ON public.project_deliverables(owner_person_id) WHERE owner_person_id IS NOT NULL;
ALTER TABLE public.project_deliverables ENABLE ROW LEVEL SECURITY;

-- ─── project_tasks — tareas (cierre por evidencia o atestiguación) ───
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  deliverable_id uuid REFERENCES public.project_deliverables(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','blocked','done')),
  owner_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  assignee_side text NOT NULL DEFAULT 'team' CHECK (assignee_side IN ('team','client')),  -- tarea del equipo vs del cliente
  start_date date,
  due_date date,
  depends_on uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  -- cierre: "sin evidencia, no hay bloque" → o hay evidencia digital, o una persona atestigua (y es la evidencia)
  closed_at timestamptz,
  closed_via text CHECK (closed_via IN ('evidence','attestation')),
  closed_by text,                   -- quién marcó (atestiguación → responde de que así fue)
  evidence_ref text,                -- ref a evidencia/reunión/correo cuando closed_via='evidence'
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.project_tasks IS 'Tareas de la sala. assignee_side=client => tarea del cliente. Cierre por evidencia o atestiguación (closed_via + closed_by). Kanban por status. Cliente/lector no mueven kanban (enforce app).';
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.project_tasks(project_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_deliverable ON public.project_tasks(deliverable_id) WHERE deliverable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON public.project_tasks(owner_person_id) WHERE owner_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.project_tasks(due_date) WHERE status <> 'done';
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- ─── project_events — event log unificado de la capa de trabajo (append-only) ───
-- Columna vertebral: de acá salen undo, atestiguación, "quién hizo qué", analítica de gestión y el feed.
CREATE TABLE IF NOT EXISTS public.project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  actor_email text,
  actor_role text,                  -- rol al momento de la acción
  verb text NOT NULL,               -- created | updated | status_changed | moved | closed | accepted | confirmed | commented | viewed ...
  target_type text NOT NULL,        -- deliverable | task | decision | phase | material | suggestion | room
  target_id uuid,
  summary text,                     -- legible: "Rocío cerró 'Puntos de recolección'"
  payload jsonb,                    -- {from, to, ...}
  evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.project_events IS 'Event log inmutable de la capa de ejecución. Append-only. Fuente de undo, atestiguación, auditoría, analítica de gestión (tab Actividad, solo-PM) y el feed "la sala se escribe sola".';
CREATE INDEX IF NOT EXISTS idx_events_project_time ON public.project_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_actor ON public.project_events(actor_person_id, created_at DESC) WHERE actor_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_target ON public.project_events(target_type, target_id);
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;

-- updated_at trigger reutilizable (idempotente)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_members') THEN
    CREATE TRIGGER set_updated_at_members BEFORE UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_phases') THEN
    CREATE TRIGGER set_updated_at_phases BEFORE UPDATE ON public.project_phases FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_deliverables') THEN
    CREATE TRIGGER set_updated_at_deliverables BEFORE UPDATE ON public.project_deliverables FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at_tasks') THEN
    CREATE TRIGGER set_updated_at_tasks BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at(); END IF;
END $$;
