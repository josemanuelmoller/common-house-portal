import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { requireSameOriginRequest } from "@/lib/require-same-origin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
const CATEGORIES = new Set(["plan_timeline", "deliverable", "presentation", "manual", "working_document", "contract_agreement", "proposal_budget", "purchase_order", "invoice", "multimedia", "other"]);

/**
 * POST /api/admin/projects/[id]/client-room/materials/upload  (multipart)
 * Admin-only. Uploads a PDF/PPTX into the private room-docs bucket and creates a
 * project_materials row (provider 'supabase', visibility internal) whose url is
 * the same-origin streaming route. Preview + download flow through the portal.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = requireSameOriginRequest(req);
  if (csrf) return csrf;
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Only PDF or PPTX files" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 });

  const title = ((form.get("title") as string) || file.name || "Documento").trim();
  const categoryRaw = (form.get("category") as string) || "presentation";
  const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "presentation";

  const path = `${project.id}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin().storage.from("room-docs").upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  const { data, error } = await supabaseAdmin()
    .from("project_materials")
    .insert({
      project_id: project.id,
      provider: "supabase",
      external_id: path,
      title,
      category,
      document_status: "in_review",
      visibility: "internal",
      url: "",
      mime_type: file.type,
      added_by: "admin",
      modified_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    await supabaseAdmin().storage.from("room-docs").remove([path]);
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 502 });
  }

  const url = `/api/projects/${project.id}/materials/${data.id}/file`;
  await supabaseAdmin().from("project_materials").update({ url }).eq("id", data.id);
  return NextResponse.json({ ok: true, id: data.id, url });
}
