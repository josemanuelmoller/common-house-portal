import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const VISIBILITY = new Set(["internal", "proposed", "client", "restricted", "archived"]);
const STATUSES = new Set(["draft", "in_review", "current", "approved", "superseded", "archived"]);
const CATEGORIES = new Set(["plan_timeline", "deliverable", "presentation", "manual", "working_document", "contract_agreement", "proposal_budget", "purchase_order", "invoice", "multimedia", "other"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; materialId: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, materialId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  let body: { visibility?: string; status?: string; category?: string; description?: string; versionLabel?: string; linkedMilestone?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.visibility) {
    if (!VISIBILITY.has(body.visibility)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    update.visibility = body.visibility;
    if (body.visibility === "client") update.client_visible_at = new Date().toISOString();
  }
  if (body.status) {
    if (!STATUSES.has(body.status)) return NextResponse.json({ error: "Invalid document status" }, { status: 400 });
    update.document_status = body.status;
  }
  if (body.category) {
    if (!CATEGORIES.has(body.category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    update.category = body.category;
  }
  if (typeof body.description === "string") update.description = body.description.trim() || null;
  if (typeof body.versionLabel === "string") update.version_label = body.versionLabel.trim() || null;
  if (typeof body.linkedMilestone === "string") update.linked_milestone = body.linkedMilestone.trim() || null;

  const { data, error } = await supabaseAdmin().from("project_materials")
    .update(update)
    .eq("id", materialId)
    .eq("project_id", project.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Material not found" }, { status: 404 });
  return NextResponse.json({ ok: true, material: data });
}
