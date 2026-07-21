import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { listProjectFiles } from "@/lib/drive";
import { resolveClientRoomProject } from "@/lib/client-room";

function inferCategory(folder: string) {
  const value = folder.toLowerCase();
  if (value.includes("finanz")) return "invoice";
  if (value.includes("present")) return "presentation";
  if (value.includes("multimedia")) return "multimedia";
  if (value.includes("manual")) return "manual";
  if (value.includes("plan") || value.includes("gantt")) return "plan_timeline";
  if (value.includes("contrat") || value.includes("acuerdo")) return "contract_agreement";
  return "working_document";
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.drive_folder_id) return NextResponse.json({ error: "Project has no Drive folder configured" }, { status: 409 });

  try {
    const files = await listProjectFiles(project.drive_folder_id);
    if (files.length === 0) return NextResponse.json({ ok: true, synced: 0 });
    const now = new Date().toISOString();
    const rows = files.map((file) => ({
      project_id: project.id,
      provider: "google_drive",
      external_id: file.id,
      title: file.name,
      url: file.webViewLink,
      mime_type: file.mimeType,
      folder_name: file.folder,
      category: inferCategory(file.folder),
      modified_at: file.modifiedTime,
      updated_at: now,
    }));
    const { error } = await supabaseAdmin()
      .from("project_materials")
      .upsert(rows, { onConflict: "project_id,provider,external_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, synced: rows.length });
  } catch (err) {
    return apiError(err, { route: "[/api/admin/projects/[id]/client-room/materials/sync-drive]", status: 502 });
  }
}
