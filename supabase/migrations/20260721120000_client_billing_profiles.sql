-- Client-submitted billing/invoicing details, one profile per project room.
-- The client fills this from their room so Common House can invoice them.
-- Service-role only; the app mediates reads/writes with per-role access checks.
create table if not exists public.client_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  legal_name text,
  tax_id text,
  address text,
  billing_email text,
  billing_contact text,
  po_reference text,
  notes text,
  submitted_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

alter table public.client_billing_profiles enable row level security;
revoke all on public.client_billing_profiles from anon, authenticated;
