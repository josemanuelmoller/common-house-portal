/**
 * POST /api/hall-organizations/link-contact
 *
 * Links a person to an organization (sets people.org_notion_id). This is the
 * resolution path for Pipeline State drift rows that read "Sin contactos
 * asociados — necesita responsable": instead of a dead-end nag, the card's
 * primary CTA opens a picker that calls this route. Once linked, the next
 * pipeline render sees the person's activity and the row either flips to a
 * real drift count or leaves the list.
 *
 * Body: { org_notion_id: string, person_notion_id: string }
 *
 * Auth: adminGuardApi (user-triggered from the Hall).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { org_notion_id?: string; person_notion_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orgNotionId = (body.org_notion_id ?? "").trim();
  const personNotionId = (body.person_notion_id ?? "").trim();
  if (!orgNotionId || !personNotionId) {
    return NextResponse.json({ error: "org_notion_id and person_notion_id required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  // Verify the org exists before linking (typo guard).
  const { data: org } = await sb
    .from("organizations")
    .select("notion_id, name")
    .eq("notion_id", orgNotionId)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const { data: person, error } = await sb
    .from("people")
    .update({ org_notion_id: orgNotionId, updated_at: new Date().toISOString() })
    .eq("notion_id", personNotionId)
    .select("notion_id, full_name, email")
    .maybeSingle();

  if (error) {
    console.error("[link-contact] update failed:", error.message);
    return NextResponse.json({ error: "Link failed" }, { status: 500 });
  }
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    linked: {
      person_notion_id: person.notion_id,
      person_name: person.full_name,
      org_notion_id: org.notion_id,
      org_name: org.name,
    },
  });
}
