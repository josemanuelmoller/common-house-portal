/**
 * POST /api/hall-contacts/bulk-tag
 *
 * Apply a set of relationship_classes to every non-dismissed, non-self
 * attendee whose email ends in @{domain}. Runs the same single-tag pipeline
 * per contact (local tag + Google Contacts write, including create / promote
 * paths), so side-effects are consistent with individual tagging.
 *
 * Body:
 *   { domain: string, relationship_classes: string[], overwrite?: boolean }
 *
 *   - domain              "climatechampions.team" (no @)
 *   - relationship_classes  array of valid class names; empty array clears tags
 *   - overwrite           default false → preserves existing classes by
 *                          union-merging them with the new set. True →
 *                          replaces entirely.
 *
 * Auth: adminGuardApi()
 *
 * Never touches dismissed rows or hall_self_identities entries.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
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

type Body = {
  domain?:                string;
  relationship_classes?:  string[];
  overwrite?:             boolean;
};

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const domain = (body.domain ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!domain || !/^[^\s@]+\.[^\s@]+$/.test(domain)) {
    return NextResponse.json({ error: "valid domain required (e.g. climatechampions.team)" }, { status: 400 });
  }

  const rawClasses = Array.isArray(body.relationship_classes) ? body.relationship_classes : [];
  const uniqClasses = [...new Set(rawClasses.map(c => String(c).trim()).filter(Boolean))];
  const invalid = uniqClasses.filter(c => !VALID_CLASSES.includes(c as typeof VALID_CLASSES[number]));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `invalid classes: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  // Load target rows — active, non-self, matching domain.
  const selfSet = await getSelfEmails();
  const { data: rows, error } = await sb
    .from("people")
    .select("email, relationship_classes, google_resource_name, display_name")
    .ilike("email", `%@${domain}`)
    .is("dismissed_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const targets = (rows ?? []).filter(r => !selfSet.has(r.email)) as {
    email: string;
    relationship_classes: string[] | null;
    google_resource_name: string | null;
    display_name: string | null;
  }[];

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, updated: 0, google_sync: { synced: 0, created: 0, promoted: 0, read_only: 0, not_in_google: 0, failed: 0 } });
  }

  const tally = { synced: 0, created: 0, promoted: 0, read_only: 0, not_in_google: 0, failed: 0 };
  const errors: Array<{ email: string; reason: string }> = [];

  // Process serially so Google rate-limiting stays gentle. Bulk of 5-50
  // contacts runs in ~seconds; large groups benefit from visible progress.
  for (const t of targets) {
    const targetClasses = body.overwrite
      ? uniqClasses
      : [...new Set([...(t.relationship_classes ?? []), ...uniqClasses])];
    const targetLabels = targetClasses
      .map(c => CLASS_TO_LABEL[c as keyof typeof CLASS_TO_LABEL])
      .filter((l): l is string => !!l);

    // Resolve / upgrade resourceName
    let resourceName = t.google_resource_name;
    if (!resourceName) {
      const resolved = await lookupByEmails([t.email]);
      resourceName = resolved.get(t.email)?.resourceName ?? null;
    }

    let outcome: keyof typeof tally = "not_in_google";
    let googleError: string | undefined;

    if (!resourceName && targetClasses.length > 0) {
      const created = await createContactFromEmail(t.email, t.display_name);
      if (created.ok) { resourceName = created.resourceName; outcome = "created"; }
      else { outcome = "failed"; googleError = created.reason; }
    } else if (resourceName?.startsWith("otherContacts/") && targetClasses.length > 0) {
      const promoted = await promoteOtherContact(resourceName);
      if (promoted.ok) { resourceName = promoted.resourceName; outcome = "promoted"; }
      else { outcome = "failed"; googleError = promoted.reason; }
    }

    if (resourceName && !resourceName.startsWith("otherContacts/")) {
      const res = await setContactLabels(resourceName, targetLabels);
      if (res.ok) {
        if (outcome !== "created" && outcome !== "promoted") outcome = "synced";
      } else {
        outcome = "failed";
        googleError = res.reason;
      }
    } else if (resourceName?.startsWith("otherContacts/")) {
      outcome = "read_only";
    }

    // Persist local classification
    const { error: upErr } = await sb
      .from("people")
      .update({
        relationship_classes: targetClasses,
        classified_at:        targetClasses.length > 0 ? nowIso : null,
        classified_by:        targetClasses.length > 0 ? actor  : null,
        google_resource_name: resourceName,
        google_last_write_at: (outcome === "synced" || outcome === "created" || outcome === "promoted") ? nowIso : null,
        google_synced_at:     (outcome === "synced" || outcome === "created" || outcome === "promoted") ? nowIso : null,
        updated_at:           nowIso,
      })
      .eq("email", t.email);
    if (upErr) {
      errors.push({ email: t.email, reason: upErr.message });
      outcome = "failed";
    }

    tally[outcome]++;
    if (googleError && outcome === "failed") errors.push({ email: t.email, reason: googleError });
  }

  return NextResponse.json({
    ok: errors.length < targets.length,
    matched: targets.length,
    updated: targets.length - (tally.failed - errors.length + errors.length),
    google_sync: tally,
    errors,
  });
}
