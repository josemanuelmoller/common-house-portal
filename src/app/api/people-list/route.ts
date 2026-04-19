/**
 * GET /api/people-list
 *
 * Returns a flat list of People from the canonical Supabase `people` table,
 * sorted by name. Used by the AgentQueueSection contact picker for assigning
 * recipients to Follow-up Email drafts.
 *
 * Only returns people who have an email address — contacts without email
 * cannot be used as draft recipients.
 *
 * Supabase-first since Wave 5 (2026-04-17). Data synced from CH People [OS v2]
 * daily at noon via /api/sync-people.
 *
 * Auth: admin session (Clerk).
 */

import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  try {
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("people")
      .select("notion_id, full_name, email")
      .not("email", "is", null)
      .order("full_name", { ascending: true });

    if (error) throw error;

    const people = (data ?? []).map(p => ({
      id:    p.notion_id,
      name:  p.full_name,
      email: p.email,
    }));

    return NextResponse.json({ people });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
