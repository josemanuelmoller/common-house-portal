/**
 * /api/hall-contacts
 *
 * GET  — Returns observed attendees from Jose's calendar with their current
 *        relationship_class. Default: last 30 days, both classified and
 *        unclassified, sorted by meeting_count DESC.
 *
 * POST — Sets or clears the relationship_class for an email. Idempotent.
 *
 * This is the human-controlled "who is this person" layer that drives
 * is_personal / has_vip classification of meetings in Suggested Time Blocks.
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const VALID_CLASSES = [
  "Family", "Personal Service", "Friend",
  "Team", "Portfolio", "Investor", "Funder", "Vendor", "External",
] as const;
type RelationshipClass = typeof VALID_CLASSES[number];

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const onlyUnclassified = searchParams.get("unclassified") === "1";
  const days = Math.max(1, Math.min(365, Number(searchParams.get("days") ?? "90")));
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    const sb = getSupabaseServerClient();
    let query = sb
      .from("hall_attendees")
      .select("email, display_name, relationship_class, auto_suggested, last_meeting_title, meeting_count, first_seen_at, last_seen_at, classified_at, classified_by")
      .gte("last_seen_at", cutoff)
      .order("meeting_count", { ascending: false })
      .order("last_seen_at",  { ascending: false })
      .limit(200);
    if (onlyUnclassified) query = query.is("relationship_class", null);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, contacts: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

  let body: { email?: string; relationship_class?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  const rc = body.relationship_class;
  if (rc !== null && rc !== undefined && !VALID_CLASSES.includes(rc as RelationshipClass)) {
    return NextResponse.json(
      { error: "relationship_class must be one of " + VALID_CLASSES.join(" | ") + " or null" },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const sb = getSupabaseServerClient();
  try {
    // Upsert — insert if not yet observed, update otherwise.
    const { data, error } = await sb
      .from("hall_attendees")
      .upsert(
        {
          email,
          relationship_class: rc ?? null,
          classified_at:      rc ? nowIso : null,
          classified_by:      rc ? actor  : null,
          updated_at:         nowIso,
        },
        { onConflict: "email" },
      )
      .select("email, relationship_class, classified_at, classified_by")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, contact: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
