/**
 * POST /api/admin/landscape/promote
 * Body: { landscapeId: uuid }
 *
 * Promotes a reuse_landscape row into the canonical `organizations` table.
 * Creates a new organizations row with org_category='Landscape Reuse Op',
 * carries over name + website + country, and writes the FK back to
 * reuse_landscape.organization_id so the row is marked "in network".
 *
 * Idempotent: if the landscape row already has organization_id set, returns
 * { ok: true, alreadyPromoted: true } without creating duplicates.
 */

import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await adminGuardApi();
  if (denied) return denied;

  let body: { landscapeId?: string } = {};
  try {
    body = (await req.json()) as { landscapeId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const landscapeId = body.landscapeId?.trim();
  if (!landscapeId) {
    return NextResponse.json({ ok: false, error: "Missing landscapeId" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  // Load the landscape row.
  const { data: landRow, error: loadErr } = await sb
    .from("reuse_landscape")
    .select(
      "id, solution_name, organization_name, website, hq_country, headquarters, mission, solution_category, sub_category, stage, status, employees_band, organization_id"
    )
    .eq("id", landscapeId)
    .single();

  if (loadErr || !landRow) {
    return NextResponse.json(
      { ok: false, error: `Landscape row not found: ${loadErr?.message ?? "unknown"}` },
      { status: 404 }
    );
  }

  if (landRow.organization_id) {
    return NextResponse.json({ ok: true, alreadyPromoted: true, organization_id: landRow.organization_id });
  }

  // Try to dedupe against an existing organizations row by website host (most
  // reliable) or by name (fallback). The check is best-effort; on collision
  // we link to the existing row instead of creating a new one.
  const websiteHost = extractHost(landRow.website);
  let existing: { id: string } | null = null;

  if (websiteHost) {
    const { data } = await sb
      .from("organizations")
      .select("id")
      .ilike("org_domains", `%${websiteHost}%`)
      .limit(1)
      .maybeSingle();
    if (data) existing = data as { id: string };
  }
  if (!existing) {
    const { data } = await sb
      .from("organizations")
      .select("id")
      .ilike("name", landRow.organization_name)
      .limit(1)
      .maybeSingle();
    if (data) existing = data as { id: string };
  }

  let orgId = existing?.id;

  if (!orgId) {
    const { data: created, error: insErr } = await sb
      .from("organizations")
      .insert({
        name: landRow.organization_name,
        website: landRow.website,
        country: landRow.hq_country,
        city: landRow.headquarters ?? null,
        org_category: "Landscape Reuse Op",
        org_domains: websiteHost,
        startup_stage: landRow.stage,
        notes: [
          landRow.mission,
          landRow.solution_category && `Category: ${landRow.solution_category}`,
          landRow.sub_category && `Sub-category: ${landRow.sub_category}`,
          `Imported from Reuse Atlas (reuse_landscape: ${landRow.id})`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      })
      .select("id")
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        { ok: false, error: `Failed to create org: ${insErr?.message ?? "unknown"}` },
        { status: 500 }
      );
    }
    orgId = (created as { id: string }).id;
  }

  // Wire the FK back on the landscape row.
  const { error: linkErr } = await sb
    .from("reuse_landscape")
    .update({ organization_id: orgId })
    .eq("id", landscapeId);

  if (linkErr) {
    return NextResponse.json(
      {
        ok: false,
        error: `Org created but FK update failed: ${linkErr.message}`,
        organization_id: orgId,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    organization_id: orgId,
    matchedExisting: !!existing,
  });
}

function extractHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
