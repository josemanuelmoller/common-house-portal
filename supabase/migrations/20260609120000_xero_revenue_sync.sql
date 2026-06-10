-- Xero integration — Phase A: OAuth token store + revenue_events idempotency.
--
-- Direction: Xero (Accounting API) → Supabase revenue_events. Read-only against
-- Xero. Notion-cutoff safe — this adds zero Notion write paths (AGENTS.md §Notion).
--
-- Idempotent by design (IF NOT EXISTS guards) so it can be re-applied safely and
-- so it matches what was run against prod on 2026-06-09 via the Supabase MCP.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Generic OAuth token store for third-party integrations (one row / provider).
--
--    Unlike Google (whose refresh token is stable and lives in an env var),
--    Xero ROTATES its refresh token on every refresh and invalidates the prior
--    one. The token therefore CANNOT live in an env var — it must be persisted
--    here and rewritten after each refresh. See src/lib/xero-auth.ts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_oauth_tokens (
  provider        text PRIMARY KEY,           -- 'xero'
  access_token    text NOT NULL,
  refresh_token   text NOT NULL,
  expires_at      timestamptz NOT NULL,
  scopes          text,
  tenant_id       text,                        -- active Xero org id (Xero-tenant-id header)
  tenant_name     text,
  last_synced_at  timestamptz,                 -- delta cursor for the invoice pull
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Service-role only. No policies: secrets must never be reachable via the anon
-- or authenticated keys (same posture as the Phase 1.3 RLS baseline).
ALTER TABLE public.integration_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Idempotency key for synced revenue events.
--
--    external_ref = Xero InvoiceID (stable GUID). `source` already exists and is
--    NOT NULL, so we reuse it ('xero'). NULLs are distinct in Postgres, so the
--    existing manual rows (external_ref IS NULL) never collide on this index.
--    The sync upserts ON CONFLICT (source, external_ref).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.revenue_events
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS revenue_events_source_external_ref_key
  ON public.revenue_events (source, external_ref);
