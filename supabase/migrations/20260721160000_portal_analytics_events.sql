-- Identified, first-party analytics for the client portal. Room visits are the
-- first consumer; `area` + nullable project_id let this extend portal-wide later.
-- Service-role only; the app ingests via an access-gated API and reads via admin.
create table if not exists public.portal_analytics_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  session_id text not null,
  actor_email text,                       -- authenticated user's email (lowercased) if known
  actor_role text,                        -- admin | approver | collaborator | viewer
  is_admin boolean not null default false,-- lets us exclude our own admin previews from client stats
  area text not null default 'room',      -- 'room' now; 'portal'/'hall'/... later
  project_id uuid references public.projects(id) on delete set null,
  slug text,
  event_type text not null,               -- visit | section_view | material_open | heartbeat | session_end
  target text,                            -- section id, material title, etc.
  duration_ms integer,                    -- session length / section dwell
  path text,
  referrer text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_portal_analytics_project_time on public.portal_analytics_events (project_id, occurred_at desc);
create index if not exists idx_portal_analytics_session on public.portal_analytics_events (session_id);
create index if not exists idx_portal_analytics_actor on public.portal_analytics_events (actor_email);

alter table public.portal_analytics_events enable row level security;
revoke all on public.portal_analytics_events from anon, authenticated;
