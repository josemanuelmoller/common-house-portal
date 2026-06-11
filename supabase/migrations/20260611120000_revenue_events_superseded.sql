-- Hall pipeline "Por cerrar": when an opportunity is marked Won from the Hall,
-- a manual revenue_event (source='hall', stage='sold') is created so the
-- commitment counts against the quarter target immediately. When the real
-- Xero invoice later arrives for the same organization, the manual sold row
-- must stop counting or the card double-counts. These columns let the Xero
-- sync supersede the manual row instead of deleting it (audit trail stays).

alter table public.revenue_events
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by text;

comment on column public.revenue_events.superseded_at is
  'Set when this (manual/hall) event was replaced by a real invoice row. Superseded rows are excluded from revenue sums.';
comment on column public.revenue_events.superseded_by is
  'external_ref (Xero InvoiceID) of the invoice row that superseded this event.';
