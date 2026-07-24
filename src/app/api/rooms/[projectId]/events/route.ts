import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, resolveRoomActor } from "@/lib/project-roles";

/**
 * Event log de la sala (tab Actividad). Solo PM (analytics.view).
 * "Carga y aporte, no vigilancia": nunca visible a cliente/colaborador/lector.
 */
export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const project = await resolveClientRoomProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  if (!can(actor.role, "analytics.view")) return NextResponse.json({ error: "Solo el PM ve la actividad" }, { status: 403 });

  const { data, error } = await supabaseAdmin()
    .from("project_events")
    .select("id, actor_email, actor_role, verb, target_type, summary, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, events: data });
}
