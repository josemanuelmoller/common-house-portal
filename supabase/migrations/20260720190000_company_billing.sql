-- Global Common House billing / payment details shown in the room's
-- Administrative section. Singleton (id=1). bank_details is exposed in the room
-- only to admins and the client's approver role (gated in the data layer).
create table if not exists public.company_billing (
  id int primary key default 1,
  legal_name text,
  tax_id text,
  address text,
  billing_email text,
  bank_details text,
  public_note text,
  updated_at timestamptz not null default now(),
  constraint company_billing_singleton check (id = 1)
);

insert into public.company_billing (id) values (1) on conflict (id) do nothing;

alter table public.company_billing enable row level security;
