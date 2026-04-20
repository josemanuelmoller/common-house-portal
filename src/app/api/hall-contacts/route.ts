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
import {
  CLASS_TO_LABEL,
  lookupByEmails,
  setContactLabels,
} from "@/lib/google-contacts";

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
      .select("email, display_name, relationship_class, relationship_classes, auto_suggested, last_meeting_title, meeting_count, first_seen_at, last_seen_at, classified_at, classified_by")
      .gte("last_seen_at", cutoff)
      .order("meeting_count", { ascending: false })
      .order("last_seen_at",  { ascending: false })
      .limit(200);
    if (onlyUnclassified) query = query.or("relationship_classes.is.null,relationship_classes.eq.{}");

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, contacts: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await doPOST(req);
  } catch (err) {
    // Never let an unhandled error return an empty 500 — the UI has no way to
    // debug that. Always surface something actionable.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "unhandled", detail: message.slice(0, 500) },
      { status: 500 },
    );
  }
}

async function doPOST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

  let body: {
    email?: string;
    relationship_class?: string | null;
    relationship_classes?: string[] | null;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  // Accept either:
  //   classes:  string[]      (canonical)
  //   class:    string | null (legacy single-value)
  //   empty array / null      → remove all classes
  const rawClasses: string[] = Array.isArray(body.relationship_classes)
    ? body.relationship_classes
    : body.relationship_class == null ? [] : [body.relationship_class];
  const uniqClasses = [...new Set(rawClasses.map(c => String(c).trim()).filter(Boolean))];
  const invalid = uniqClasses.filter(c => !VALID_CLASSES.includes(c as RelationshipClass));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `invalid classes: ${invalid.join(", ")}. Allowed: ${VALID_CLASSES.join(" | ")}` },
      { status: 400 },
    );
  }
  const classes = uniqClasses as RelationshipClass[];

  const nowIso = new Date().toISOString();
  const sb = getSupabaseServerClient();

  // Ensure we have the Google resourceName. If hall_attendees has no
  // google_resource_name yet, hit People API to resolve + cache.
  let resourceName: string | null = null;
  try {
    const { data: existing } = await sb
      .from("hall_attendees")
      .select("google_resource_name")
      .eq("email", email)
      .maybeSingle();
    resourceName = (existing as { google_resource_name: string | null } | null)?.google_resource_name ?? null;
    if (!resourceName) {
      const resolved = await lookupByEmails([email]);
      const hit = resolved.get(email);
      resourceName = hit?.resourceName ?? null;
    }
  } catch { /* carry on — local write still happens */ }

  // Dual-write to Google Contacts — set exactly the target labels, remove
  // any known label no longer selected. Empty array clears all known labels.
  let googleSyncOutcome: "synced" | "not_in_google" | "read_only" | "skipped" | "failed" = "skipped";
  let googleError: string | undefined;
  if (resourceName) {
    const targetLabels = classes
      .map(c => CLASS_TO_LABEL[c as keyof typeof CLASS_TO_LABEL])
      .filter((l): l is string => !!l);
    const res = await setContactLabels(resourceName, targetLabels);
    if (res.ok) googleSyncOutcome = "synced";
    else if (res.reason === "read_only_other_contact") googleSyncOutcome = "read_only";
    else { googleSyncOutcome = "failed"; googleError = res.reason; }
  } else {
    googleSyncOutcome = "not_in_google";
  }

  try {
    const { data, error } = await sb
      .from("hall_attendees")
      .upsert(
        {
          email,
          relationship_classes:  classes,
          classified_at:         classes.length > 0 ? nowIso : null,
          classified_by:         classes.length > 0 ? actor  : null,
          google_resource_name:  resourceName,
          google_last_write_at:  googleSyncOutcome === "synced" ? nowIso : null,
          google_synced_at:      googleSyncOutcome === "synced" ? nowIso : null,
          updated_at:            nowIso,
        },
        { onConflict: "email" },
      )
      .select("email, relationship_class, relationship_classes, classified_at, classified_by, google_resource_name, google_last_write_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      contact: data,
      google_sync: googleSyncOutcome,
      ...(googleError ? { google_error: googleError } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
