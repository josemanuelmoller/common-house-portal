// NOTE: server-only marker intentionally OMITTED.
// src/lib/plan.ts imports supabaseAdmin and is in turn imported by client
// components (PlanView, ArtifactRow, CreateDraftPanel). Adding "server-only"
// here breaks the build until plan.ts is split into client-safe types vs
// server DB calls (tracked as Wave 4). Defense-in-depth via server-only
// is in effect on supabase-server.ts, notion/core.ts, drive.ts, and
// google-auth.ts.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/** Server-only Supabase client backed by the service role key. Never import from a client component. */
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("supabaseAdmin: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}
