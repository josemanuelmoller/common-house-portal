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
  createContactFromEmail,
  lookupByEmails,
  promoteOtherContact,
  setContactLabels,
} from "@/lib/google-contacts";

const VALID_CLASSES = [
  "Family", "Personal Service", "Friend",
  "Team", "Portfolio",
  "VIP", "Investor", "Funder", "Client",
  "Partner", "Vendor", "External",
] as const;
type RelationshipClass = typeof VALID_CLASSES[number];

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const onlyUnclassified = searchParams.get("unclassified") === "1";
  const includeDismissed = searchParams.get("include_dismissed") === "1";
  const days = Math.max(1, Math.min(365, Number(searchParams.get("days") ?? "90")));
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    const sb = getSupabaseServerClient();
    let query = sb
      .from("people")
      .select("email, display_name, relationship_class, relationship_classes, auto_suggested, last_meeting_title, meeting_count, first_seen_at, last_seen_at, classified_at, classified_by, dismissed_at, dismissed_reason")
      .gte("last_seen_at", cutoff)
      .order("meeting_count", { ascending: false })
      .order("last_seen_at",  { ascending: false })
      .limit(200);
    if (onlyUnclassified) query = query.or("relationship_classes.is.null,relationship_classes.eq.{}");
    if (!includeDismissed) query = query.is("dismissed_at", null);

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
    person_id?: string;
    relationship_class?: string | null;
    relationship_classes?: string[] | null;
    action?: "dismiss" | "undismiss" | "tag";
    reason?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Accept either email or person_id as identifier — WhatsApp-first contacts
  // without an email need to be addressable by id.
  const email    = (body.email ?? "").trim().toLowerCase();
  const personId = (body.person_id ?? "").trim();
  const hasEmail = !!email && /.+@.+\..+/.test(email);
  const hasId    = !!personId;
  if (!hasEmail && !hasId) {
    return NextResponse.json({ error: "email or person_id required" }, { status: 400 });
  }

  // Resolve to a unique row via whichever key was provided.
  const sbLookup = getSupabaseServerClient();
  const lookupQ  = hasEmail
    ? sbLookup.from("people").select("id, email").eq("email", email).maybeSingle()
    : sbLookup.from("people").select("id, email").eq("id", personId).maybeSingle();
  const { data: found } = await lookupQ;
  if (!found) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }
  const rowId = (found as { id: string; email: string | null }).id;

  // ── Dismiss / undismiss shortcut path — no classes needed ─────────────────
  if (body.action === "dismiss" || body.action === "undismiss") {
    const sb = getSupabaseServerClient();
    const nowIso = new Date().toISOString();
    const isDismiss = body.action === "dismiss";
    const { data, error } = await sb
      .from("people")
      .update({
        dismissed_at:     isDismiss ? nowIso : null,
        dismissed_by:     isDismiss ? actor  : null,
        dismissed_reason: isDismiss ? (body.reason ?? null) : null,
        updated_at:       nowIso,
      })
      .eq("id", rowId)
      .select("id, email, dismissed_at, dismissed_by, dismissed_reason")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: body.action, contact: data });
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

  // Resolve the Google resourceName: (1) check cache, (2) search People API.
  // Only possible when we have an email — WA-first contacts skip Google sync.
  let resourceName: string | null = null;
  let displayNameCached: string | null = null;
  try {
    const { data: existing } = await sb
      .from("people")
      .select("google_resource_name, display_name, email")
      .eq("id", rowId)
      .maybeSingle();
    const row = existing as { google_resource_name: string | null; display_name: string | null; email: string | null } | null;
    resourceName = row?.google_resource_name ?? null;
    displayNameCached = row?.display_name ?? null;
    const addressableEmail = row?.email ?? (hasEmail ? email : null);
    if (!resourceName && addressableEmail) {
      const resolved = await lookupByEmails([addressableEmail]);
      const hit = resolved.get(addressableEmail);
      resourceName = hit?.resourceName ?? null;
      if (hit?.displayName) displayNameCached = hit.displayName;
    }
  } catch { /* carry on — local write still happens */ }

  // Three paths for Google Contacts write, depending on where the attendee
  // currently lives:
  //   A) not in Google at all           → create in myContacts, then tag
  //   B) in Google's 'Other contacts'   → promote to myContacts, then tag
  //                                        (old behaviour refused to tag)
  //   C) already in myContacts          → just tag
  // Clearing tags on an absent or otherContact record is a no-op — we do not
  // materialise empty contacts or promote just to untag.
  let googleSyncOutcome:
    | "synced" | "created" | "promoted" | "not_in_google" | "read_only" | "skipped" | "failed"
    = "skipped";
  let googleError: string | undefined;

  if (!resourceName && classes.length > 0 && hasEmail) {
    // Path A — only possible if we have an email to create a Google contact from
    const created = await createContactFromEmail(email, displayNameCached);
    if (created.ok) { resourceName = created.resourceName; googleSyncOutcome = "created"; }
    else { googleError = created.reason; googleSyncOutcome = "failed"; }
  } else if (resourceName?.startsWith("otherContacts/") && classes.length > 0) {
    // Path B — promote, then use the new people/c… resourceName
    const promoted = await promoteOtherContact(resourceName);
    if (promoted.ok) { resourceName = promoted.resourceName; googleSyncOutcome = "promoted"; }
    else { googleError = promoted.reason; googleSyncOutcome = "failed"; }
  }

  if (resourceName && !resourceName.startsWith("otherContacts/")) {
    // Path A/B end, or path C
    const targetLabels = classes
      .map(c => CLASS_TO_LABEL[c as keyof typeof CLASS_TO_LABEL])
      .filter((l): l is string => !!l);
    const res = await setContactLabels(resourceName, targetLabels);
    if (res.ok) {
      // Keep 'created' / 'promoted' — more informative than generic 'synced'
      if (googleSyncOutcome !== "created" && googleSyncOutcome !== "promoted") {
        googleSyncOutcome = "synced";
      }
    } else {
      googleSyncOutcome = "failed";
      googleError = res.reason;
    }
  } else if (googleSyncOutcome !== "failed" && googleSyncOutcome !== "created" && googleSyncOutcome !== "promoted") {
    googleSyncOutcome = resourceName?.startsWith("otherContacts/") ? "read_only" : "not_in_google";
  }

  try {
    // Update by id so the email-null path works. The row already exists
    // because we resolved rowId earlier.
    const { data, error } = await sb
      .from("people")
      .update({
        relationship_classes:  classes,
        classified_at:         classes.length > 0 ? nowIso : null,
        classified_by:         classes.length > 0 ? actor  : null,
        google_resource_name:  resourceName,
        google_last_write_at:  ["synced", "created", "promoted"].includes(googleSyncOutcome) ? nowIso : null,
        google_synced_at:      ["synced", "created", "promoted"].includes(googleSyncOutcome) ? nowIso : null,
        updated_at:            nowIso,
      })
      .eq("id", rowId)
      .select("id, email, relationship_class, relationship_classes, classified_at, classified_by, google_resource_name, google_last_write_at")
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
