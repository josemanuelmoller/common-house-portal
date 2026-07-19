import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { createProjectFolders } from "@/lib/drive";
import { resolveClientRoomProject } from "@/lib/client-room";

/**
 * POST /api/admin/projects/[id]/client-room/drive-folder
 * Admin-only. Creates the standard Drive folder structure for this room's
 * project (root + 💰 Finanzas / 📋 Documentación / 📊 Presentaciones / 🎨 Multimedia)
 * and persists drive_folder_id / drive_folder_url on the project so materials
 * sync can index it. Idempotent: returns the existing folder if already set.
 * Does NOT share with the client — sharing happens explicitly at invite time.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.drive_folder_id) {
    return NextResponse.json({
      ok: true,
      alreadyExists: true,
      driveFolderId: project.drive_folder_id,
      driveFolderUrl: project.drive_folder_url,
    });
  }

  const name = project.name?.trim();
  if (!name) return NextResponse.json({ error: "Project has no name" }, { status: 400 });

  try {
    const { rootFolderId, subfolders } = await createProjectFolders(name);
    const url = `https://drive.google.com/drive/folders/${rootFolderId}`;
    const { error } = await supabaseAdmin()
      .from("projects")
      .update({ drive_folder_id: rootFolderId, drive_folder_url: url })
      .eq("id", project.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, driveFolderId: rootFolderId, driveFolderUrl: url, subfolders });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
