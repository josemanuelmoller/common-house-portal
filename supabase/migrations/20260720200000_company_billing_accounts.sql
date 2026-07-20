-- Multiple structured bank accounts (USD/GBP, local/international) + VAT number.
-- bank_accounts: array of { title, details }. tax_id is reused as the UK company
-- registration number in the UI.
alter table public.company_billing add column if not exists bank_accounts jsonb not null default '[]'::jsonb;
alter table public.company_billing add column if not exists vat_number text;
