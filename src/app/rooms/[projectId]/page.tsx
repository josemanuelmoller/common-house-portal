import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { capabilitiesFor, resolveRoomActor } from "@/lib/project-roles";
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

  const db = supabaseAdmin();
  const [proj, phases, deliverables, tasks] = await Promise.all([
    db.from("projects").select("id, name, current_stage").eq("id", project.id).single(),
    db.from("project_phases").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_deliverables").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_tasks").select("*").eq("project_id", project.id).order("position", { ascending: true }),
  ]);

  return (
    <RoomClient
      projectId={project.id}
      role={actor.role}
      capabilities={capabilitiesFor(actor.role)}
      project={proj.data ?? { id: project.id, name: null, current_stage: null }}
      initialPhases={phases.data ?? []}
      initialDeliverables={deliverables.data ?? []}
      initialTasks={tasks.data ?? []}
    />
  );
}
