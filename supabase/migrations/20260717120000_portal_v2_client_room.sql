-- Portal 2.0 — secure client room foundation
--
-- Additive migration. Supabase remains the only write target; no Notion mirror.
-- The client-facing DTO is assembled server-side after Clerk + client_access
-- authorization. All new tables stay service-role-only under RLS.

-- ─── Projects: room identity + Drive root ───────────────────────────────────

alter table public.projects
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists drive_folder_id text,
  add column if not exists drive_folder_url text,
  add column if not exists client_room_enabled boolean not null default false,
  add column if not exists client_room_status text not null default 'preparing',
  add column if not exists client_room_label text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_client_room_status_check'
  ) then
    alter table public.projects
      add constraint projects_client_room_status_check
      check (client_room_status in ('preparing', 'shared', 'active', 'complete', 'archived'));
  end if;
end $$;

create index if not exists projects_organization_id_idx
  on public.projects (organization_id)
  where organization_id is not null;

-- Preserve every already-published slug route during the additive rollout.
update public.projects
set client_room_enabled = true,
    client_room_status = case
      when client_room_status = 'preparing' then 'shared'
      else client_room_status
    end
where hall_slug is not null;

-- Best-effort bridge from the legacy textual relation. Safe when either side
-- has not yet been backfilled.
update public.projects p
set organization_id = o.id
from public.organizations o
where p.organization_id is null
  and p.primary_org_notion_id is not null
  and o.notion_id = p.primary_org_notion_id;

-- ─── Client access: approver role + correct active uniqueness ────────────────

alter table public.client_access
  drop constraint if exists client_access_role_check;

alter table public.client_access
  add constraint client_access_role_check
  check (role in ('viewer', 'collaborator', 'approver'));

-- A room can be granted before the recipient has created a Clerk account.
-- At sign-in we accept the email grant only when Clerk reports that primary
-- email as verified. Existing user-id grants continue to work unchanged.
alter table public.client_access
  alter column clerk_user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_access_principal_check'
  ) then
    alter table public.client_access
      add constraint client_access_principal_check
      check (clerk_user_id is not null or granted_email is not null);
  end if;
end $$;

-- UNIQUE(..., revoked_at) does not prevent duplicate active rows in Postgres
-- because NULL values are distinct. Replace it with a partial unique index.
alter table public.client_access
  drop constraint if exists client_access_unique_active;

create unique index if not exists client_access_unique_active_idx
  on public.client_access (clerk_user_id, project_id)
  where revoked_at is null and clerk_user_id is not null;

create unique index if not exists client_access_email_active_idx
  on public.client_access (lower(granted_email), project_id)
  where revoked_at is null and granted_email is not null;

create index if not exists client_access_email_lookup_idx
  on public.client_access (lower(granted_email))
  where revoked_at is null and granted_email is not null;

-- ─── Project materials: Drive is storage, portal owns context/visibility ─────

create table if not exists public.project_materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null default 'google_drive'
    check (provider in ('google_drive', 'supabase', 'external')),
  external_id text,
  title text not null,
  description text,
  category text not null default 'working_document'
    check (category in (
      'plan_timeline', 'deliverable', 'presentation', 'manual',
      'working_document', 'contract_agreement', 'proposal_budget',
      'purchase_order', 'invoice', 'multimedia', 'other'
    )),
  document_status text not null default 'draft'
    check (document_status in ('draft', 'in_review', 'current', 'approved', 'superseded', 'archived')),
  visibility text not null default 'internal'
    check (visibility in ('internal', 'proposed', 'client', 'restricted', 'archived')),
  url text not null,
  mime_type text,
  folder_name text,
  version_label text,
  linked_milestone text,
  supersedes_id uuid references public.project_materials(id) on delete set null,
  modified_at timestamptz,
  client_visible_at timestamptz,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_materials_external_unique
  on public.project_materials (project_id, provider, external_id);
create index if not exists project_materials_client_idx
  on public.project_materials (project_id, category, modified_at desc)
  where visibility = 'client' and document_status <> 'archived';

alter table public.project_materials enable row level security;
revoke all on public.project_materials from anon;
revoke all on public.project_materials from authenticated;

-- ─── Agreements + immutable response trail ──────────────────────────────────

create table if not exists public.project_agreements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  agreement_type text not null default 'operational'
    check (agreement_type in (
      'understanding', 'decision', 'scope', 'timeline', 'deliverable',
      'commercial', 'purchase_order', 'operational'
    )),
  title text not null,
  summary text,
  status text not null default 'draft'
    check (status in (
      'draft', 'shared', 'acknowledged', 'approved',
      'changes_requested', 'rejected', 'superseded', 'archived'
    )),
  visibility text not null default 'internal'
    check (visibility in ('internal', 'client', 'archived')),
  source_id uuid references public.sources(id) on delete set null,
  material_id uuid references public.project_materials(id) on delete set null,
  due_at timestamptz,
  version integer not null default 1,
  requested_by text,
  requested_at timestamptz,
  responded_by text,
  responded_email text,
  responded_at timestamptz,
  response_comment text,
  supersedes_id uuid references public.project_agreements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_agreements_client_idx
  on public.project_agreements (project_id, status, requested_at desc)
  where visibility = 'client' and status <> 'archived';

alter table public.project_agreements enable row level security;
revoke all on public.project_agreements from anon;
revoke all on public.project_agreements from authenticated;

create table if not exists public.project_agreement_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.project_agreements(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  actor_clerk_user_id text,
  actor_email text,
  comment text,
  agreement_version integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_agreement_events_agreement_idx
  on public.project_agreement_events (agreement_id, created_at desc);

alter table public.project_agreement_events enable row level security;
revoke all on public.project_agreement_events from anon;
revoke all on public.project_agreement_events from authenticated;

-- Atomic response transition. Authorization stays in the server-only DAL;
-- execute is revoked from browser roles as defence in depth.
create or replace function public.respond_to_project_agreement(
  p_agreement_id uuid,
  p_expected_version integer,
  p_action text,
  p_actor_clerk_user_id text,
  p_actor_email text,
  p_comment text default null
)
returns public.project_agreements
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.project_agreements;
  next_status text;
  updated_row public.project_agreements;
begin
  if p_action not in ('acknowledge', 'approve', 'request_changes', 'reject') then
    raise exception 'invalid agreement action';
  end if;

  select * into current_row
  from public.project_agreements
  where id = p_agreement_id
  for update;

  if not found then raise exception 'agreement not found'; end if;
  if current_row.visibility <> 'client' then raise exception 'agreement is not client-visible'; end if;
  if current_row.status not in ('shared', 'changes_requested') then
    raise exception 'agreement cannot be answered from status %', current_row.status;
  end if;
  if current_row.version <> p_expected_version then raise exception 'stale agreement version'; end if;

  next_status := case p_action
    when 'acknowledge' then 'acknowledged'
    when 'approve' then 'approved'
    when 'request_changes' then 'changes_requested'
    when 'reject' then 'rejected'
  end;

  update public.project_agreements
  set status = next_status,
      responded_by = p_actor_clerk_user_id,
      responded_email = p_actor_email,
      responded_at = now(),
      response_comment = nullif(trim(p_comment), ''),
      version = version + 1,
      updated_at = now()
  where id = p_agreement_id
  returning * into updated_row;

  insert into public.project_agreement_events (
    agreement_id, project_id, action, from_status, to_status,
    actor_clerk_user_id, actor_email, comment, agreement_version, snapshot
  ) values (
    updated_row.id, updated_row.project_id, p_action, current_row.status, next_status,
    p_actor_clerk_user_id, p_actor_email, nullif(trim(p_comment), ''),
    updated_row.version, to_jsonb(updated_row)
  );

  return updated_row;
end;
$$;

revoke all on function public.respond_to_project_agreement(uuid, integer, text, text, text, text) from public;
revoke all on function public.respond_to_project_agreement(uuid, integer, text, text, text, text) from anon;
revoke all on function public.respond_to_project_agreement(uuid, integer, text, text, text, text) from authenticated;
grant execute on function public.respond_to_project_agreement(uuid, integer, text, text, text, text) to service_role;

comment on table public.project_materials is
  'Project file index. Drive stores bytes; this table owns category, lifecycle, links and client visibility.';
comment on table public.project_agreements is
  'Versioned shared understanding, decisions and approvals for a client room.';
comment on table public.project_agreement_events is
  'Immutable audit trail for project agreement publication and client responses.';
