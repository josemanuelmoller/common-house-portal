-- ADR-001 Phase 1 — person <-> organization memberships (additive over people.org_notion_id single pointer).
-- ADDITIVE ONLY. people.org_notion_id is preserved for dual-read/dual-write during transition (ADR §4.5).
-- Backfill (Phase 3) copies ONLY already-confirmed links. No employment is ever inferred from email domain.

create table if not exists public.person_organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text,
  area            text,
  is_primary      boolean not null default false,
  started_at      timestamptz,
  ended_at        timestamptz,
  source_refs     jsonb not null default '[]'::jsonb,
  confidence      numeric,
  confirmed_at    timestamptz,
  confirmed_by    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One active membership per (person, org). History preserved via ended_at.
create unique index if not exists uq_person_org_active
  on public.person_organization_memberships (person_id, organization_id)
  where ended_at is null;

-- At most one primary org per person among active memberships.
create unique index if not exists uq_person_primary_active
  on public.person_organization_memberships (person_id)
  where is_primary and ended_at is null;

create index if not exists ix_person_org_person on public.person_organization_memberships (person_id);
create index if not exists ix_person_org_org    on public.person_organization_memberships (organization_id);

drop trigger if exists trg_person_org_touch on public.person_organization_memberships;
create trigger trg_person_org_touch
  before update on public.person_organization_memberships
  for each row execute function public.touch_rel_model_updated_at();

alter table public.person_organization_memberships enable row level security;
revoke all on public.person_organization_memberships from anon, authenticated;
