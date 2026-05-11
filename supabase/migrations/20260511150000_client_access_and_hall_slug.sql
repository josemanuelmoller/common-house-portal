-- Client-scoped portal access (Phase 1.1 of client onboarding)
--
-- Adds two things:
--   1. projects.hall_slug — public URL slug per project (kinko, origenes-ecuador, ...)
--   2. client_access — table mapping Clerk user → project(s) they can read
--
-- Why:
--   Today /hall reads project ID from a hardcoded email→projectId map in
--   src/lib/clients.ts (CLIENT_REGISTRY). That works for 1 internal user but
--   doesn't scope properly for external clients, doesn't allow multi-project
--   users, and isn't revocable without a code deploy.
--
--   This migration adds the data layer the new /hall/[slug] route depends on.
--
-- Conservative properties:
--   - Both columns/tables are ADDITIVE only.
--   - hall_slug is nullable. Existing rows untouched until manually set.
--   - client_access has NO data yet; existing CLIENT_REGISTRY behaviour is
--     unaffected until /hall/[slug] route is shipped + middleware updated.
--   - REVOKE ALL from anon/authenticated keeps RLS posture from
--     20260511120000_rls_defense_in_depth.sql consistent.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. projects.hall_slug
-- ────────────────────────────────────────────────────────────────────────────

alter table public.projects
  add column if not exists hall_slug text;

-- Slug must be URL-safe lowercase, no spaces. Allow letters, digits, hyphens.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_hall_slug_format'
  ) then
    alter table public.projects
      add constraint projects_hall_slug_format
      check (hall_slug is null or hall_slug ~ '^[a-z0-9][a-z0-9-]{0,62}$');
  end if;
end $$;

-- Slug must be unique across projects (when set). Partial unique index so
-- multiple nulls coexist without conflict.
create unique index if not exists projects_hall_slug_unique
  on public.projects (hall_slug)
  where hall_slug is not null;

comment on column public.projects.hall_slug is
  'Public URL slug for /hall/[slug]. Lowercase alnum + hyphen, max 63 chars. Unique when set.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. client_access table
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_access (
  id          uuid primary key default gen_random_uuid(),
  -- Clerk user ID is the authoritative principal. We do NOT store email here
  -- because emails can change in Clerk and rebinding by email is fragile.
  -- The grant flow looks up the Clerk user by email at grant time and stores
  -- the resulting userId.
  clerk_user_id text not null,
  -- Optional: also record the email at grant time for human-readable audit.
  -- Not used as the auth key.
  granted_email text,

  -- The Supabase project this access row pertains to.
  project_id  uuid not null references public.projects(id) on delete cascade,

  -- Access role within that project. 'viewer' = read-only Hall; future:
  -- 'collaborator' could allow upload/comment writes if/when we build those.
  role text not null default 'viewer'
    check (role in ('viewer', 'collaborator')),

  -- Audit
  granted_by  text not null,  -- Clerk userId or email of the admin who granted
  granted_at  timestamptz not null default now(),
  -- Optional expiration. NULL = indefinite. Used for prospect demos that
  -- should auto-revoke (e.g. "2-week demo window").
  expires_at  timestamptz,

  -- Soft revoke. Revoking sets revoked_at + revoked_by; access checks must
  -- filter to revoked_at IS NULL.
  revoked_at  timestamptz,
  revoked_by  text,
  revoked_reason text,

  -- Only one active grant per (user, project). Multiple historical grants
  -- (e.g. revoked then re-granted) are allowed.
  constraint client_access_unique_active
    unique (clerk_user_id, project_id, revoked_at)
);

comment on table public.client_access is
  'Maps Clerk user → project for client-scoped /hall/[slug] access. revoked_at IS NULL means active.';

create index if not exists client_access_user_idx
  on public.client_access (clerk_user_id)
  where revoked_at is null;

create index if not exists client_access_project_idx
  on public.client_access (project_id)
  where revoked_at is null;

-- RLS posture matches the rest of the schema: deny anon/authenticated;
-- service role bypasses RLS by default in Supabase.
alter table public.client_access enable row level security;
revoke all on public.client_access from anon;
revoke all on public.client_access from authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Set slugs for the two pre-sale demo projects (Kinko + Orígenes)
-- ────────────────────────────────────────────────────────────────────────────

update public.projects
   set hall_slug = 'kinko'
 where id = '5787468c-a023-4041-8ae4-adcf32358c8f'
   and hall_slug is null;

update public.projects
   set hall_slug = 'origenes-ecuador'
 where id = 'a8be2b46-7f9b-4e14-81b9-8e3a34f4af38'
   and hall_slug is null;
