-- ADR-001 Phase 1 — canonical durable relationships between an organization and Common House.
-- ADDITIVE ONLY. Does not touch organizations.org_category / relationship_stage / relationship_classes / engagements.
-- Relationship is now expressed here; legacy columns remain readable for compatibility (see ADR §5).

-- Shared updated_at touch fn for the ADR-001 relational model (self-contained; no dependency on pre-existing fns).
create or replace function public.touch_rel_model_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organization_relationships (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  relationship_type   text not null,
  relationship_state  text,
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  source_refs         jsonb not null default '[]'::jsonb,
  notes               text,
  created_by          text,
  updated_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint organization_relationships_type_ck
    check (relationship_type in ('portfolio','client','partner','vendor','investor','funder')),

  -- state validity by type (defense in depth; the service layer validates too).
  -- client: state must be NULL (activity derives from opportunities/projects).
  constraint organization_relationships_state_ck
    check (
      relationship_state is null
      or (relationship_type = 'portfolio' and relationship_state in ('accompanied','followed'))
      or (relationship_type = 'partner'   and relationship_state in ('exploring','active','paused','not_current'))
      or (relationship_type = 'vendor'    and relationship_state in ('active','paused','not_current'))
      or (relationship_type = 'investor'  and relationship_state in ('active','inactive'))
      or (relationship_type = 'funder'    and relationship_state in ('active','inactive'))
    )
);

-- At most one ACTIVE relationship of a given type per org (history via ended_at is preserved; reactivation reopens/adds).
create unique index if not exists uq_org_rel_active
  on public.organization_relationships (organization_id, relationship_type)
  where ended_at is null;

create index if not exists ix_org_rel_org   on public.organization_relationships (organization_id);
create index if not exists ix_org_rel_type  on public.organization_relationships (relationship_type);

drop trigger if exists trg_org_rel_touch on public.organization_relationships;
create trigger trg_org_rel_touch
  before update on public.organization_relationships
  for each row execute function public.touch_rel_model_updated_at();

-- Append-only change log, distinct from row updated_at (reactivations, state changes, ends).
create table if not exists public.organization_relationship_events (
  id                       uuid primary key default gen_random_uuid(),
  organization_relationship_id uuid not null references public.organization_relationships(id) on delete cascade,
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  event_type               text not null,  -- created | state_changed | ended | reactivated | note
  from_state               text,
  to_state                 text,
  actor                    text,
  detail                   jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);
create index if not exists ix_org_rel_event_rel on public.organization_relationship_events (organization_relationship_id);
create index if not exists ix_org_rel_event_org on public.organization_relationship_events (organization_id);

-- Service-role-only, matching every business table's posture.
alter table public.organization_relationships        enable row level security;
alter table public.organization_relationship_events  enable row level security;
revoke all on public.organization_relationships        from anon, authenticated;
revoke all on public.organization_relationship_events  from anon, authenticated;
