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

/** Extended row shape — used by /admin/opportunities (full read path). */
export type OpportunityRowFull = OpportunityRow & {
  probability: string | null;
  org_notion_id: string | null;
  source_url: string | null;
  notes: string | null;
  why_there_is_fit: string | null;
  follow_up_status: string | null;
  opportunity_score: number | null;
  review_url: string | null;
  updated_at: string | null;
  is_legacy: boolean;
  is_archived: boolean;
  is_active: boolean;
  is_actionable: boolean;
  data_quality_score: number;
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

/**
 * Fetch non-legacy, non-archived opportunities for the /admin/opportunities pipeline page.
 * Excludes is_legacy=true and is_archived=true rows.
 */
export async function fetchCleanOpportunitiesFromSupabase(): Promise<{
  rows: OpportunityRowFull[];
  error: string | null;
}> {
  try {
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("opportunities")
      .select(
        "notion_id, title, status, opportunity_type, scope, qualification_status, priority, probability, org_notion_id, org_name, trigger_signal, suggested_next_step, value_estimate, expected_close_date, source_url, notes, why_there_is_fit, follow_up_status, opportunity_score, review_url, updated_at, is_legacy, is_archived, is_active, is_actionable, data_quality_score"
      )
      .eq("is_legacy", false)
      .eq("is_archived", false)
      .order("opportunity_score", { ascending: false, nullsFirst: false });

    if (error) return { rows: [], error: error.message };
    return { rows: (data as OpportunityRowFull[]) ?? [], error: null };
  } catch (err) {
    return { rows: [], error: String(err) };
  }
}
