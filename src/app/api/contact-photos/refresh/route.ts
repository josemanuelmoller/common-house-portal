/**
 * POST /api/contact-photos/refresh
 *
 * Refresh the photo for a single contact on demand (admin UI button).
 * Same resolution order as the batch sync: Google Contacts → Gravatar.
 * Skips if photo_source='manual' unless force=true.
 *
 * Body: { person_id?: string, email?: string, force?: boolean }
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolvePhoto, type PhotoSource } from "@/lib/contact-photos";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { person_id?: string; email?: string; force?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  let q = sb.from("people").select("id, email, google_resource_name, photo_url, photo_source, photo_updated_at");
  if (body.person_id)  q = q.eq("id", body.person_id);
  else if (body.email) q = q.eq("email", body.email.trim().toLowerCase());
  else return NextResponse.json({ error: "person_id or email required" }, { status: 400 });

  const { data: row, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!row)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  type R = { id: string; email: string | null; google_resource_name: string | null; photo_url: string | null; photo_source: PhotoSource | null };
  const r = row as unknown as R;

  if (r.photo_source === "manual" && !body.force) {
    return NextResponse.json({
      ok: true, skipped: true, reason: "manual photo — pass force=true to override",
      photo_url: r.photo_url, photo_source: r.photo_source,
    });
  }

  const res = await resolvePhoto(r);
  const nowIso = new Date().toISOString();
  await sb.from("people").update({
    photo_url:        res.url,
    photo_source:     res.source,
    photo_updated_at: nowIso,
    updated_at:       nowIso,
  }).eq("id", r.id);

  return NextResponse.json({ ok: true, photo_url: res.url, photo_source: res.source });
}
