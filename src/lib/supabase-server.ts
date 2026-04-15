/**
 * supabase-server.ts
 * Server-only Supabase client factory.
 *
 * ⚠ NEVER import this from a "use client" component — the anon key
 * would be bundled and sent to the browser.
 *
 * Uses SUPABASE_URL + SUPABASE_ANON_KEY (no NEXT_PUBLIC_ prefix = server only).
 * Read-only access pattern: no service role key needed for SELECT on opportunities.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Returns a cached server-side Supabase client. Throws if env vars are missing. */
export function getSupabaseServerClient(): SupabaseClient {
  if (_client) return _client;

  // Use the same env var names already configured in Vercel production.
  // NEXT_PUBLIC_SUPABASE_URL is the project URL (not a secret).
  // SUPABASE_SERVICE_KEY is the service role key — server-only, never bundled.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY not set. Check .env.local or Vercel env vars."
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false }, // server-side: never persist sessions
  });

  return _client;
}

/** Typed row shape for the opportunities table (read path only). */
export type OpportunityRow = {
  notion_id: string;
  title: string;
  status: string | null;
  opportunity_type: string | null;
  scope: string | null;
  qualification_status: string | null;
  priority: string | null;
  org_name: string | null;
  trigger_signal: string | null;
  suggested_next_step: string | null;
  value_estimate: number | null;
  expected_close_date: string | null;
};

/** Fetch all opportunities from Supabase (server-side, read-only). */
export async function fetchOpportunitiesFromSupabase(): Promise<{
  rows: OpportunityRow[];
  error: string | null;
}> {
  try {
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("opportunities")
      .select(
        "notion_id, title, status, opportunity_type, scope, qualification_status, priority, org_name, trigger_signal, suggested_next_step, value_estimate, expected_close_date"
      )
      .order("title", { ascending: true });

    if (error) return { rows: [], error: error.message };
    return { rows: (data as OpportunityRow[]) ?? [], error: null };
  } catch (err) {
    return { rows: [], error: String(err) };
  }
}
