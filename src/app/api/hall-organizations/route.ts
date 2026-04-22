/**
 * /api/hall-organizations
 *
 * GET  — lists registered orgs (non-dismissed) optionally augmented with
 *        contact counts from hall_attendees per domain.
 *
 * POST — upsert one org by domain. Body:
 *          { domain, name?, relationship_classes?, notes?,
 *            action?: 'upsert' | 'dismiss' | 'undismiss',
 *            cascade?: boolean,
 *            cascade_overwrite?: boolean }
 *        - 'upsert'    (default) creates or updates the row.
 *        - 'dismiss'   hides the org from proposals.
 *        - 'undismiss' restores it.
 *        - cascade=true applies relationship_classes to every active,
 *           non-self contact of this domain via the same pipeline as
 *           /api/hall-contacts/bulk-tag (Google Contacts create / promote
 *           / label). Default false.
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import {
  CLASS_TO_LABEL,
  createContactFromEmail,
  lookupByEmails,
  promoteOtherContact,
  setContactLabels,
} from "@/lib/google-contacts";

// Org class vocabulary — matches contacts minus personal.
const VALID_ORG_CLASSES = [
  "Team", "Portfolio", "Client", "Partner",
  "Investor", "Funder", "VIP", "Vendor", "External",
] as const;

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("hall_organizations")
    .select("*")
    .is("dismissed_at", null)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, orgs: data ?? [] });
}

type Body = {
  domain?:                string;
  name?:                  string;
  relationship_classes?:  string[];
  notes?:                 string;
  action?:                "upsert" | "dismiss" | "undismiss";
  cascade?:               boolean;
  cascade_overwrite?:     boolean;
  reason?:                string;
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
    return NextResponse.json({ error: "valid domain required" }, { status: 400 });
  }

  const action = body.action ?? "upsert";
  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  // ── Dismiss / undismiss ────────────────────────────────────────────────────
  if (action === "dismiss" || action === "undismiss") {
    const isDismiss = action === "dismiss";
    const { data, error } = await sb
      .from("hall_organizations")
      .update({
        dismissed_at:     isDismiss ? nowIso : null,
        dismissed_by:     isDismiss ? actor  : null,
        dismissed_reason: isDismiss ? (body.reason ?? null) : null,
        updated_at:       nowIso,
      })
      .eq("domain", domain)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action, org: data });
  }

  // ── Upsert ────────────────────────────────────────────────────────────────
  const rawClasses = Array.isArray(body.relationship_classes) ? body.relationship_classes : [];
  const uniqClasses = [...new Set(rawClasses.map(c => String(c).trim()).filter(Boolean))];
  const invalid = uniqClasses.filter(c => !VALID_ORG_CLASSES.includes(c as typeof VALID_ORG_CLASSES[number]));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `invalid org classes: ${invalid.join(", ")}. Allowed: ${VALID_ORG_CLASSES.join(" | ")}` },
      { status: 400 },
    );
  }

  // Infer name if caller did not provide: use most common displayName among
  // contacts of this domain, fallback to capitalised domain root.
  let name = (body.name ?? "").trim();
  if (!name) {
    const { data: contacts } = await sb
      .from("people")
      .select("display_name")
      .ilike("email", `%@${domain}`)
      .is("dismissed_at", null)
      .not("display_name", "is", null)
      .limit(25);
    const rootHint = domain.split(".")[0];
    // Derive org name heuristically: second word of displayName often
    // matches the org (when multiple contacts share it). We just pick the
    // first non-null display_name as a weak hint.
    const firstName = (contacts ?? [])[0]?.display_name as string | undefined;
    name = firstName
      ? (firstName.split(/\s+/).slice(1).join(" ") || firstName)
      : rootHint.replace(/^[a-z]/, c => c.toUpperCase());
  }

  const upsertPayload: Record<string, unknown> = {
    domain,
    name,
    relationship_classes: uniqClasses,
    classified_at:        uniqClasses.length > 0 ? nowIso : null,
    classified_by:        uniqClasses.length > 0 ? actor : null,
    notes:                body.notes ?? null,
    updated_at:           nowIso,
  };

  const { data: org, error: upErr } = await sb
    .from("hall_organizations")
    .upsert(upsertPayload, { onConflict: "domain" })
    .select("*")
    .maybeSingle();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // ── Cascade to contacts ───────────────────────────────────────────────────
  let cascadeReport: {
    matched: number;
    created: number;
    promoted: number;
    synced: number;
    read_only: number;
    not_in_google: number;
    failed: number;
  } | null = null;

  if (body.cascade) {
    const selfSet = await getSelfEmails();
    const { data: rows } = await sb
      .from("people")
      .select("email, relationship_classes, google_resource_name, display_name")
      .ilike("email", `%@${domain}`)
      .is("dismissed_at", null);
    const targets = (rows ?? []).filter(r => !selfSet.has(r.email)) as {
      email: string;
      relationship_classes: string[] | null;
      google_resource_name: string | null;
      display_name: string | null;
    }[];

    const tally = { matched: targets.length, created: 0, promoted: 0, synced: 0, read_only: 0, not_in_google: 0, failed: 0 };

    for (const t of targets) {
      const targetClasses = body.cascade_overwrite
        ? uniqClasses
        : [...new Set([...(t.relationship_classes ?? []), ...uniqClasses])];
      const targetLabels = targetClasses
        .map(c => CLASS_TO_LABEL[c as keyof typeof CLASS_TO_LABEL])
        .filter((l): l is string => !!l);

      let resourceName = t.google_resource_name;
      if (!resourceName) {
        const resolved = await lookupByEmails([t.email]);
        resourceName = resolved.get(t.email)?.resourceName ?? null;
      }

      let outcome: "synced" | "created" | "promoted" | "read_only" | "not_in_google" | "failed" = "not_in_google";

      if (!resourceName && targetClasses.length > 0) {
        const created = await createContactFromEmail(t.email, t.display_name);
        if (created.ok) { resourceName = created.resourceName; outcome = "created"; }
        else outcome = "failed";
      } else if (resourceName?.startsWith("otherContacts/") && targetClasses.length > 0) {
        const promoted = await promoteOtherContact(resourceName);
        if (promoted.ok) { resourceName = promoted.resourceName; outcome = "promoted"; }
        else outcome = "failed";
      }

      if (resourceName && !resourceName.startsWith("otherContacts/")) {
        const res = await setContactLabels(resourceName, targetLabels);
        if (res.ok) {
          if (outcome !== "created" && outcome !== "promoted") outcome = "synced";
        } else outcome = "failed";
      } else if (resourceName?.startsWith("otherContacts/")) {
        outcome = "read_only";
      }

      await sb.from("people").update({
        relationship_classes: targetClasses,
        classified_at:        targetClasses.length > 0 ? nowIso : null,
        classified_by:        targetClasses.length > 0 ? actor : null,
        google_resource_name: resourceName,
        google_last_write_at: (outcome === "synced" || outcome === "created" || outcome === "promoted") ? nowIso : null,
        google_synced_at:     (outcome === "synced" || outcome === "created" || outcome === "promoted") ? nowIso : null,
        updated_at:           nowIso,
      }).eq("email", t.email);

      tally[outcome]++;
    }

    cascadeReport = tally;
  }

  return NextResponse.json({ ok: true, org, cascade: cascadeReport });
}
