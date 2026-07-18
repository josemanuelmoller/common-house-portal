-- Portal 2.0 — stateful project memory
--
-- A project is not its raw transcript history. These tables hold the small,
-- reviewable current model that operations can act on, plus time-bound claims
-- and implementation learnings that may later earn promotion to knowledge.

create table if not exists public.project_states (
  project_id uuid primary key references public.projects(id) on delete cascade,
  current_summary text,
  current_phase text,
  current_focus text,
  health text not null default 'unknown'
    check (health in ('on_track', 'watch', 'blocked', 'paused', 'unknown')),
  confidence smallint not null default 50 check (confidence between 0 and 100),
  next_check_in_at timestamptz,
  last_source_at timestamptz,
  last_state_change_at timestamptz,
  stale_after timestamptz,
  state_status text not null default 'draft'
    check (state_status in ('draft', 'current', 'stale', 'archived')),
  generated_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_states_review_idx
  on public.project_states (state_status, stale_after)
  where state_status in ('current', 'stale');

-- Historical revisions make the model inspectable without forcing the user to
-- repeatedly reread source material. The full state at each accepted edit is
-- kept as a snapshot, not inferred from a mutable current row.
create table if not exists public.project_state_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  action text not null check (action in ('created', 'edited', 'confirmed', 'marked_stale', 'system_refresh')),
  actor text,
  snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists project_state_revisions_project_idx
  on public.project_state_revisions (project_id, created_at desc);

-- A current-state item is a claim to operate against, not automatically a
-- permanent truth. source_refs point to canonical source/evidence IDs; expiry
-- prevents abandoned priorities and offline outcomes from becoming ghosts.
create table if not exists public.project_state_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  item_type text not null check (item_type in (
    'decision', 'commitment', 'risk', 'dependency', 'question', 'milestone',
    'stakeholder_signal', 'assumption', 'outcome'
  )),
  statement text not null,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'superseded', 'unknown', 'expired')),
  owner_label text,
  stakeholder_label text,
  source_refs text[] not null default '{}',
  confidence smallint not null default 50 check (confidence between 0 and 100),
  due_at timestamptz,
  last_confirmed_at timestamptz,
  stale_after timestamptz,
  resolution_note text,
  visibility text not null default 'internal'
    check (visibility in ('internal', 'client')),
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_state_items_active_idx
  on public.project_state_items (project_id, item_type, stale_after)
  where status = 'active';

-- Implementation learning deliberately starts below the institutional
-- knowledge threshold. It records how a project was implemented (questions by
-- area, friction, stakeholder patterns) and can be promoted only after review.
create table if not exists public.project_learning_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  learning_type text not null check (learning_type in (
    'implementation_question', 'stakeholder_need', 'friction',
    'decision_pattern', 'operating_pattern', 'outcome'
  )),
  area text,
  title text not null,
  observation text not null,
  implication text,
  status text not null default 'observed'
    check (status in ('observed', 'review', 'promoted', 'rejected', 'stale')),
  transferability text not null default 'project'
    check (transferability in ('project', 'candidate', 'confirmed')),
  confidence smallint not null default 50 check (confidence between 0 and 100),
  source_refs text[] not null default '{}',
  last_seen_at timestamptz,
  stale_after timestamptz,
  promoted_knowledge_asset_id uuid references public.knowledge_assets(id) on delete set null,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_learning_items_review_idx
  on public.project_learning_items (project_id, status, transferability, stale_after);

alter table public.project_states enable row level security;
alter table public.project_state_revisions enable row level security;
alter table public.project_state_items enable row level security;
alter table public.project_learning_items enable row level security;
revoke all on public.project_states from anon, authenticated;
revoke all on public.project_state_revisions from anon, authenticated;
revoke all on public.project_state_items from anon, authenticated;
revoke all on public.project_learning_items from anon, authenticated;

-- Give existing projects a human-readable initial state without pretending it
-- is freshly verified. The state opens as draft and needs confirmation.
insert into public.project_states (
  project_id, current_summary, current_phase, current_focus, state_status,
  generated_by, stale_after, last_state_change_at
)
select
  p.id,
  nullif(p.status_summary, ''),
  p.current_stage,
  nullif(p.hall_current_focus, ''),
  'draft',
  'migration:portal-2',
  now() + interval '21 days',
  now()
from public.projects p
where not exists (select 1 from public.project_states ps where ps.project_id = p.id);

comment on table public.project_states is
  'Current operational model of a project. Concise, reviewable, and expiration-aware.';
comment on table public.project_state_items is
  'Time-bound claims used to operate a project; source_refs preserve traceability.';
comment on table public.project_learning_items is
  'Implementation observations held below the knowledge threshold until reviewed and promoted.';
