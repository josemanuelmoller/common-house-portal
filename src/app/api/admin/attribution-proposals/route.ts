/**
 * Admin review queue for medium-confidence attribution proposals.
 *
 * GET   → pending proposals + the active project / org catalogs (for the
 *         "adjust" dropdowns).
 * PATCH → { id, action: "approve" | "adjust" | "reject",
 *           project_notion_id?, org_notion_id? }
 *   - approve → apply the proposed project/org to the evidence
 *   - adjust  → apply the OVERRIDDEN project/org from the body
 *   - reject  → mark rejected, leave the evidence untouched
 * Rejected/decided proposals are never re-proposed (classifier upserts with
 * ignoreDuplicates on evidence_id).
 */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const sb = getSupabaseServerClient();
  const [proposalsRes, projectsRes, orgsRes] = await Promise.all([
    sb.from("evidence_attribution_proposals").select("*").eq("status", "pending").order("proposed_project_name", { ascending: true }).limit(1000),
    sb.from("projects").select("notion_id, name").eq("project_status", "Active").order("name"),
    sb.from("organizations").select("notion_id, name").order("name"),
  ]);
  return NextResponse.json({
    proposals: proposalsRes.data ?? [],
    projects: (projectsRes.data ?? []).filter((p: { notion_id: string | null }) => p.notion_id),
    orgs: (orgsRes.data ?? []).filter((o: { notion_id: string | null }) => o.notion_id),
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? "admin";

  let body: { id?: string; action?: string; project_notion_id?: string | null; org_notion_id?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { id, action } = body;
  if (!id || !action) return NextResponse.json({ error: "id and action required" }, { status: 400 });

  const sb = getSupabaseServerClient();
  const { data: p } = await sb.from("evidence_attribution_proposals").select("*").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const now = new Date().toISOString();

  if (action === "reject") {
    await sb.from("evidence_attribution_proposals").update({ status: "rejected", decided_at: now, decided_by: actor, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "approve" || action === "adjust") {
    const project = action === "adjust" ? (body.project_notion_id ?? null) : (p.proposed_project_notion_id as string | null);
    const org     = action === "adjust" ? (body.org_notion_id ?? null)     : (p.proposed_org_notion_id as string | null);
    const patch: { project_notion_id?: string; org_notion_id?: string } = {};
    if (project) patch.project_notion_id = project;
    if (org) patch.org_notion_id = org;
    if (Object.keys(patch).length) {
      const { error } = await sb.from("evidence").update(patch).eq("id", p.evidence_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    }
    await sb.from("evidence_attribution_proposals").update({ status: action === "adjust" ? "adjusted" : "approved", decided_at: now, decided_by: actor, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, applied: patch });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
