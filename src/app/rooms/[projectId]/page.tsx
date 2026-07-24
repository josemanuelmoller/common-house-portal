import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { capabilitiesFor, listRoomsForActor, resolveRoomActor } from "@/lib/project-roles";
import { RoomClient } from "./RoomClient";

export const dynamic = "force-dynamic";

/**
 * Sala de trabajo (Bloque 0). Accesible por cualquier miembro (project_members);
 * lo que ve y puede hacer sale de sus capabilities. Carga el estado server-side
 * y delega la interacción al client component (que cablea a /api/rooms/*).
 */
export default async function RoomPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { projectId } = await params;
  const project = await resolveClientRoomProject(projectId);
  if (!project) redirect("/hall");

  const actor = await resolveRoomActor(project.id);
  if (!actor.role) redirect("/hall"); // no es miembro de esta sala

  const caps = capabilitiesFor(actor.role);
  const db = supabaseAdmin();
  const [proj, phases, deliverables, tasks, decisions, materials] = await Promise.all([
    db.from("projects").select("id, name, current_stage").eq("id", project.id).single(),
    db.from("project_phases").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_deliverables").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_tasks").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_decisions").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_materials").select("id, title, url, mime_type, category, folder_name, modified_at").eq("project_id", project.id).order("modified_at", { ascending: false }),
  ]);

  // Actividad (event log) solo para PM.
  type Ev = { id: string; actor_email: string | null; actor_role: string | null; verb: string; target_type: string; summary: string | null; created_at: string };
  let events: Ev[] = [];
  if (caps.includes("analytics.view")) {
    const ev = await db.from("project_events").select("id, actor_email, actor_role, verb, target_type, summary, created_at").eq("project_id", project.id).order("created_at", { ascending: false }).limit(60);
    events = (ev.data ?? []) as Ev[];
  }
  // Descarga gateada: al que no puede, se le omite la url.
  const canDownload = caps.includes("material.download");
  const mats = (materials.data ?? []).map((m) => (canDownload ? m : { ...m, url: null }));

  // Salas del usuario (acordeón del sidebar).
  const rooms = await listRoomsForActor(actor);

  return (
    <RoomClient
      projectId={project.id}
      role={actor.role}
      capabilities={caps}
      project={proj.data ?? { id: project.id, name: null, current_stage: null }}
      rooms={rooms}
      initialPhases={phases.data ?? []}
      initialDeliverables={deliverables.data ?? []}
      initialTasks={tasks.data ?? []}
      initialDecisions={decisions.data ?? []}
      initialMaterials={mats}
      initialEvents={events}
    />
  );
}
