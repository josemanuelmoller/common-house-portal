import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, resolveRoomActor } from "@/lib/project-roles";

/**
 * Materiales de la sala (index de Drive en project_materials).
 * Ver: todos. Descargar: pm/colaborador/cliente. Al Lector se le OMITE la url
 * (ve la lista pero no puede bajar) — enforce a nivel de datos, no solo UI.
 */
export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const project = await resolveClientRoomProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  if (!can(actor.role, "material.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin()
    .from("project_materials")
    .select("id, title, url, mime_type, category, folder_name, modified_at")
    .eq("project_id", project.id)
    .order("modified_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const canDownload = can(actor.role, "material.download");
  const materials = (data ?? []).map((m) => (canDownload ? m : { ...m, url: null }));
  return NextResponse.json({ ok: true, materials, canDownload });
}
