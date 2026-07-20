-- Engagement timeline for client rooms.
-- A curated, backward-looking record of the work done together — meetings held
-- (with attendees), signed documents (NDA), milestones (proposal sent) — so the
-- client can see that real time has been dedicated. Distinct from the
-- forward-looking "Plan" (hall_hero.timeline). Admin-curated; every row is
-- internal until explicitly set visibility='client'. Service-role access only.

create table if not exists public.project_timeline_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  event_date date not null,
  kind text not null default 'milestone'
    check (kind in ('meeting', 'milestone', 'document', 'exchange')),
  title text not null,
  summary text,
  attendees text[] not null default '{}',
  location text,
  visibility text not null default 'internal'
    check (visibility in ('internal', 'client', 'archived')),
  source_id uuid references public.sources(id) on delete set null,
  material_id uuid references public.project_materials(id) on delete set null,
  agreement_id uuid references public.project_agreements(id) on delete set null,
  sort_order integer not null default 0,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_timeline_events_project
  on public.project_timeline_events (project_id, event_date desc, sort_order);

alter table public.project_timeline_events enable row level security;
