/**
 * POST /api/hall-contacts/profile
 *
 * Fill in or update the profile fields of an existing `people` row. Used by
 * the WA-only accordion in /admin/hall/contacts to "graduate" a WhatsApp-only
 * stub (no email) into a full contact — the user adds email + LinkedIn +
 * notes + optional name correction, and the row moves from the WA-only
 * section into All Contacts.
 *
 * Body:
 *   {
 *     person_id:      uuid,          // required
 *     email?:         string | null, // added only when going from null → set
 *     full_name?:     string | null,
 *     display_name?:  string | null,
 *     linkedin?:      string | null,
 *     job_title?:     string | null,
 *     phone?:         string | null,
 *     notes?:         string | null,
 *     country?:       string | null,
 *     city?:          string | null,
 *   }
 *
 * Only fields present in the body are updated. Missing fields are left
 * untouched. `null` explicitly clears the field.
 *
 * Email collisions return 409 with a `conflict_with` hint so the UI can
 * offer a merge instead.
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type Body = {
  person_id?:    string;
  email?:        string | null;
  full_name?:    string | null;
  display_name?: string | null;
  linkedin?:     string | null;
  job_title?:    string | null;
  phone?:        string | null;
  notes?:        string | null;
  country?:      string | null;
  city?:         string | null;
};

const FIELDS: Array<keyof Body> = [
  "email", "full_name", "display_name",
  "linkedin", "job_title", "phone", "notes",
  "country", "city",
];

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const personId = (body.person_id ?? "").trim();
  if (!personId) return NextResponse.json({ error: "person_id required" }, { status: 400 });

  // Normalise email — lowercase, trim. Reject malformed values early so we
  // return 400 instead of a DB check-constraint failure.
  if (body.email != null && body.email !== "") {
    const e = String(body.email).trim().toLowerCase();
    if (!/.+@.+\..+/.test(e)) {
      return NextResponse.json({ error: "malformed email" }, { status: 400 });
    }
    body.email = e;
  } else if (body.email === "") {
    body.email = null;
  }

  const sb = getSupabaseServerClient();

  // Check for email collision before attempting the update — this lets us
  // return a useful conflict_with hint rather than a generic 23505.
  if (typeof body.email === "string" && body.email.length > 0) {
    const { data: colliding } = await sb
      .from("people")
      .select("id, full_name, display_name, email")
      .eq("email", body.email)
      .neq("id", personId)
      .maybeSingle();
    if (colliding) {
      return NextResponse.json({
        error:         "email_collision",
        message:       "Another contact already uses this email. Try merging instead.",
        conflict_with: colliding,
      }, { status: 409 });
    }
  }

  // Build the patch — only include fields that were actually present in the
  // body (so a PATCH that only sets `linkedin` doesn't clobber `email`).
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    // Preserve explicit nulls (used to clear a field). Treat empty string as null.
    patch[f] = v === "" ? null : v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from("people")
    .update(patch)
    .eq("id", personId)
    .select("id, email, full_name, display_name, linkedin, job_title, phone, notes, country, city")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, contact: data });
}
