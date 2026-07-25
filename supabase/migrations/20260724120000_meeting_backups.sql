-- Manifest of Fireflies meetings backed up to Google Drive.
--
-- One row per Fireflies transcript. The row is the source of truth for
-- "is this meeting safely on Drive?" — the reconcile agent writes it after a
-- successful Drive upload, and the prune agent reads it (checksum + age) to
-- decide what is safe to delete from Fireflies. Retrieval never scans Drive
-- folders: the drive_*_id columns pin the exact files.
--
-- checksum = "<duration_min>:<sentence_count>" — a cheap integrity signal.
-- If Fireflies later reports a different value for the same id (e.g. a
-- re-processed transcript), the reconcile agent re-backs-up and refreshes it.

create table if not exists public.meeting_backups (
  fireflies_id              text primary key,
  title                     text,
  meeting_date              date,
  duration_min              numeric,
  sentence_count            integer,
  checksum                  text,
  drive_folder              text,
  drive_transcript_id       text,
  drive_summary_id          text,
  drive_fulljson_id         text,
  drive_transcript_link     text,
  source_id                 uuid references public.sources(id) on delete set null,
  backed_up_at              timestamptz,
  deleted_from_fireflies_at timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists meeting_backups_meeting_date_idx
  on public.meeting_backups (meeting_date);

create index if not exists meeting_backups_deleted_idx
  on public.meeting_backups (deleted_from_fireflies_at);

-- Server-only table: all access is through the service-role key in server
-- routes/crons. Enable RLS with no policies so the anon/authenticated keys
-- cannot read or write it directly.
alter table public.meeting_backups enable row level security;
