import { redirect } from "next/navigation";
import { attachSources, type SuggestionRow } from "@/lib/proposal-sources";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { capabilitiesFor, listRoomsForActor, resolveRoomActor } from "@/lib/project-roles";
import { loadRoomContext, loadRoomEvidence, loadRoomMeetings } from "@/lib/room-context";
import { suggestRoomStructure } from "@/lib/room-structure";
import { clientStageLabel } from "@/lib/client-stage";
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
    db.from("projects").select("id, name, current_stage, client_stage_label, room_language, notion_id, hall_draft, hall_welcome_note").eq("id", project.id).single(),
    db.from("project_phases").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_deliverables").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_tasks").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_decisions").select("*").eq("project_id", project.id).order("position", { ascending: true }),
    db.from("project_materials").select("id, title, url, mime_type, category, folder_name, modified_at, visibility").eq("project_id", project.id).order("modified_at", { ascending: false }),
  ]);

  // Actividad (event log) solo para PM.
  type Ev = { id: string; actor_email: string | null; actor_role: string | null; verb: string; target_type: string; summary: string | null; created_at: string };
  let events: Ev[] = [];
  if (caps.includes("analytics.view")) {
    const ev = await db.from("project_events").select("id, actor_email, actor_role, verb, target_type, summary, created_at").eq("project_id", project.id).order("created_at", { ascending: false }).limit(60);
    events = (ev.data ?? []) as Ev[];
  }
  // Visibilidad gateada: los materiales internos (contratos, propuestas, docs de
  // trabajo del equipo) solo los ve quien tiene internal.view. Cliente y lector
  // ven únicamente lo marcado como visible para cliente — mismo criterio que la
  // sala de preventa (loadMaterials en @/lib/client-room).
  const canSeeInternal = caps.includes("internal.view");
  const visibleMats = (materials.data ?? []).filter((m) => canSeeInternal || m.visibility === "client");
  // Descarga gateada: al que no puede, se le omite la url.
  const canDownload = caps.includes("material.download");
  const mats = visibleMats.map((m) => (canDownload ? m : { ...m, url: null }));

  // Salas del usuario (acordeón) + contexto de "Proyecto" + reuniones + sugerencias pendientes.
  const [rooms, context, meetings, evidence, suggRes] = await Promise.all([
    listRoomsForActor(actor),
    loadRoomContext(project.id, actor, caps),
    loadRoomMeetings((proj.data?.notion_id as string | null) ?? null, caps.includes("internal.view")),
    caps.includes("internal.view") ? loadRoomEvidence((proj.data?.notion_id as string | null) ?? null) : Promise.resolve([]),
    caps.includes("suggestion.view")
      ? db.from("project_state_proposals").select("id, proposal_kind, item_type, summary, rationale, source_refs, created_at").eq("project_id", project.id).eq("status", "pending").order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
  ]);
  // notion_id sale del select explícito de arriba, no de un cast: si llegara
  // undefined, TODA la evidencia se marcaría como ajena al proyecto — una
  // alarma falsa en cada propuesta.
  const suggestions = await attachSources(
    (suggRes.data ?? []) as SuggestionRow[],
    (proj.data?.notion_id as string | null) ?? null,
  );

  // Empty-state: la sala no parte de cero; si no tiene estructura, se sugiere una
  // (heredando personas/Drive/reuniones de la preventa) para que el PM la apruebe.
  const lang = proj.data?.room_language === "en" ? "en" : "es";
  const emptyRoom = (phases.data?.length ?? 0) === 0 && (deliverables.data?.length ?? 0) === 0 && (tasks.data?.length ?? 0) === 0;
  const suggestion = emptyRoom ? suggestRoomStructure(lang, proj.data?.hall_draft ?? null) : null;

  return (
    <RoomClient
      projectId={project.id}
      role={actor.role}
      capabilities={caps}
      isSuperAdmin={actor.isSuperAdmin}
      personId={actor.personId}
      defaultLang={lang}
      emptyRoom={emptyRoom}
      suggestion={suggestion}
      /* El estado interno NO cruza al componente cliente: se traduce acá, así el
         pill de la sala no puede mostrar lenguaje de pipeline aunque alguien
         escriba "Ganada" en current_stage. Ver src/lib/client-stage.ts. */
      project={{
        id: proj.data?.id ?? project.id,
        name: proj.data?.name ?? null,
        current_stage: proj.data
          ? clientStageLabel(proj.data.current_stage as string | null, proj.data.client_stage_label as string | null)
          : null,
      }}
      rooms={rooms}
      meta={context.meta}
      team={context.team}
      billing={context.billing}
      meetings={meetings}
      evidence={evidence}
      suggestions={suggestions}
      heroNote={(proj.data?.hall_welcome_note as string | null) ?? null}
      initialPhases={phases.data ?? []}
      initialDeliverables={deliverables.data ?? []}
      initialTasks={tasks.data ?? []}
      initialDecisions={decisions.data ?? []}
      initialMaterials={mats}
      initialEvents={events}
    />
  );
}
