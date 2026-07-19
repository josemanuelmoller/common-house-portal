-- ADR-001 Phase 1 — organizations participating in a project, with a specific role.
-- ADDITIVE ONLY. projects.organization_id (primary org) is preserved and untouched; it stops being the SOLE
-- source of truth about who is involved. The primary org is NOT assumed to be the client (see ADR §4.4, §6).

create table if not exists public.project_organization_roles (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  role                 text not null,
  participation_status text not null default 'active',
  started_at           timestamptz,
  ended_at             timestamptz,
  source_refs          jsonb not null default '[]'::jsonb,
  client_visible       boolean not null default false,
  notes                text,
  created_by           text,
  updated_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint project_organization_roles_role_ck
    check (role in ('client','sponsor','delivery_lead','technology_provider','implementation_partner','co_development_partner')),
  constraint project_organization_roles_status_ck
    check (participation_status in ('active','paused','completed','cancelled'))
);

-- An org can hold several roles on a project, but not the SAME active role twice.
create unique index if not exists uq_proj_org_role_active
  on public.project_organization_roles (project_id, organization_id, role)
  where ended_at is null;

create index if not exists ix_proj_org_role_project on public.project_organization_roles (project_id);
create index if not exists ix_proj_org_role_org     on public.project_organization_roles (organization_id);
create index if not exists ix_proj_org_role_role    on public.project_organization_roles (role);

drop trigger if exists trg_proj_org_role_touch on public.project_organization_roles;
create trigger trg_proj_org_role_touch
  before update on public.project_organization_roles
  for each row execute function public.touch_rel_model_updated_at();

alter table public.project_organization_roles enable row level security;
revoke all on public.project_organization_roles from anon, authenticated;
