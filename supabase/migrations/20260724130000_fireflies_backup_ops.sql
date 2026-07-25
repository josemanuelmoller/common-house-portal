-- Operational surface for the Fireflies backup agent.
--
-- Two tables:
--   fireflies_backup_state — a single cached snapshot (jsonb) the daily
--     capture-reconcile writes and the /admin panel reads. Avoids hitting the
--     Fireflies API on every page load. Self-healing: recomputed each run, so
--     a capture gap that Jose later fills (by uploading from desktop) simply
--     disappears on the next run — no manual dismissal needed.
--
--   fireflies_backup_flags — durable questions/doubts the agent raises for a
--     human (kind='question'), and blocking problems (kind='backup_error',
--     'not_digested'). These persist until resolved, unlike the live snapshot.

create table if not exists public.fireflies_backup_state (
  id          text primary key default 'latest',
  snapshot    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.fireflies_backup_flags (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                 -- question | backup_error | not_digested
  ref          text,                          -- fireflies_id or calendar event_id
  title        text,
  question     text,                          -- what the agent is asking / reporting
  detail       jsonb,
  status       text not null default 'open',  -- open | resolved | dismissed
  resolution   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists fireflies_backup_flags_status_idx
  on public.fireflies_backup_flags (status);

-- Server-only: all access via the service-role key in server routes.
alter table public.fireflies_backup_state enable row level security;
alter table public.fireflies_backup_flags enable row level security;
