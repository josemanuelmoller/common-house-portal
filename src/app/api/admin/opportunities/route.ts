/**
 * POST /api/admin/opportunities
 *   — create a new opportunity in the canonical `exploration` stage.
 *     A proposal is an opportunity, NOT a project (ADR-001).
 *
 * Body: { title (required), organization_id?, org_name?, opportunity_type?, scope? }
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const orgId = body.organization_id == null || body.organization_id === "" ? null : String(body.organization_id);

  const sb = getSupabaseServerClient();

  // If an org uuid is supplied, carry its notion_id too so legacy org-scoped
  // reads (which still key on org_notion_id) keep working during transition.
  let orgNotionId: string | null = null;
  let orgName: string | null = typeof body.org_name === "string" ? body.org_name.trim() || null : null;
  if (orgId) {
    const { data: org } = await sb
      .from("organizations")
      .select("notion_id, name")
      .eq("id", orgId)
      .maybeSingle();
    orgNotionId = (org as { notion_id: string | null } | null)?.notion_id ?? null;
    if (!orgName) orgName = (org as { name: string | null } | null)?.name ?? null;
  }

  const insert: Record<string, unknown> = {
    title,
    status: "New",
    canonical_stage: "exploration",
    organization_id: orgId,
    org_notion_id: orgNotionId,
    org_name: orgName,
    opportunity_type: typeof body.opportunity_type === "string" ? body.opportunity_type : null,
    scope: typeof body.scope === "string" ? body.scope : "CH",
    is_legacy: false,
    is_archived: false,
    is_active: true,
    has_signal: false,
    is_actionable: true,
    is_followed: false,
  };

  const { data, error } = await sb.from("opportunities").insert(insert).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
