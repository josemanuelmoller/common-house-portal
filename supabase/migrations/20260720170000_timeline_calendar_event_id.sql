-- Dedup key for calendar-sourced timeline meetings. Lets the calendar → timeline
-- sync be idempotent: one calendar event maps to one timeline row per project.
alter table public.project_timeline_events add column if not exists calendar_event_id text;

create unique index if not exists uq_project_timeline_events_calendar
  on public.project_timeline_events (project_id, calendar_event_id)
  where calendar_event_id is not null;
