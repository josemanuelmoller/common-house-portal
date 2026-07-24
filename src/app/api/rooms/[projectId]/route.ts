import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, capabilitiesFor, resolveRoomActor } from "@/lib/project-roles";

/**
 * Read-model de la sala: un solo fetch para el UI.
 * Devuelve el rol del que mira + sus capacidades (para habilitar/deshabilitar UI)
 * y el estado de la sala (fases + entregables + tareas). Scope: si no es miembro, 403.
 */
export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const project = await resolveClientRoomProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  if (!can(actor.role, "room.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = supabaseAdmin();
  const [proj, phases, deliverables, tasks] = await Promise.all([
    db.from("projects").select("id, name, current_stage, workroom_mode, hall_slug, client_logo_url").eq("id", project.id).single(),
    db.from("project_phases").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_deliverables").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_tasks").select("*").eq("project_id", project.id).order("position", { ascending: true }),
  ]);
  const dbError = proj.error || phases.error || deliverables.error || tasks.error;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });

  return NextResponse.json({
    ok: true,
    role: actor.role,
    capabilities: capabilitiesFor(actor.role),
    project: proj.data,
    phases: phases.data,
    deliverables: deliverables.data,
    tasks: tasks.data,
  });
}
