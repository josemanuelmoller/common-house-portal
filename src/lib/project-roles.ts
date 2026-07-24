import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminEmail, isAdminUser } from "@/lib/clients";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Roles y permisos por sala. Traduce la matriz (memoria project_work_room_roles)
 * a un guard reutilizable + emisor de eventos. Los roles viven en project_members
 * (uno por sala); José (platform admin) actúa como PM en cualquier sala.
 *
 * Enforce en la capa de app (service-key bypasea RLS), igual que el resto del portal.
 */

export type RoomRole = "pm" | "collaborator" | "client" | "reader";

export type Capability =
  | "room.view"
  | "internal.view"        // notas internas del equipo
  | "financial.view"       // bloque financiero interno
  | "analytics.view"       // tab Actividad / pulso del equipo
  | "task.mark_own"        // marcar hecha una tarea propia
  | "task.manage"          // gestionar cualquier tarea del equipo
  | "task.move"            // mover en kanban (cambiar estado)
  | "task.crud"            // crear / asignar / editar tareas
  | "deliverable.move"     // mover entregable en kanban
  | "deliverable.accept"   // sign-off del cliente / PM
  | "structure.edit"       // crear/editar/borrar entregables o fases (directo)
  | "structure.suggest"    // proponer cambios estructurales (colaborador)
  | "decision.comment"
  | "decision.resolve_own" // resolver una decisión que le corresponde
  | "decision.manage"      // registrar / cerrar decisiones
  | "suggestion.view"      // bandeja "la IA propone"
  | "suggestion.confirm"   // confirmar/aplicar sugerencias (solo PM)
  | "material.view"
  | "material.download"
  | "material.upload"
  | "member.manage"        // invitar / gestionar acceso
  | "room.configure";      // aprobar estructura inicial / config

const ALL: Capability[] = [
  "room.view", "internal.view", "financial.view", "analytics.view",
  "task.mark_own", "task.manage", "task.move", "task.crud",
  "deliverable.move", "deliverable.accept", "structure.edit", "structure.suggest",
  "decision.comment", "decision.resolve_own", "decision.manage",
  "suggestion.view", "suggestion.confirm",
  "material.view", "material.download", "material.upload",
  "member.manage", "room.configure",
];

const MATRIX: Record<RoomRole, Capability[]> = {
  pm: ALL,
  collaborator: [
    "room.view", "internal.view",
    "task.mark_own", "task.manage", "task.move", "task.crud",
    "deliverable.move", "structure.suggest",
    "decision.comment", "decision.resolve_own", "decision.manage",
    "suggestion.view",
    "material.view", "material.download", "material.upload",
  ],
  client: [
    "room.view",
    "task.mark_own",
    "deliverable.accept",
    "decision.comment", "decision.resolve_own",
    "material.view", "material.download", "material.upload",
  ],
  reader: ["room.view", "material.view"],
};

export interface RoomActor {
  email: string | null;
  clerkId: string | null;
  personId: string | null;
  role: RoomRole | null;   // null => sin membresía => sin acceso a la sala
  isSuperAdmin: boolean;   // José / platform admin
}

/** ¿Este rol puede esta capacidad? */
export function can(role: RoomRole | null, cap: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(cap);
}

/** Todas las capacidades de un rol — el front las usa para habilitar/deshabilitar UI. */
export function capabilitiesFor(role: RoomRole | null): Capability[] {
  return role ? [...MATRIX[role]] : [];
}

/**
 * Resuelve quién es y qué rol tiene en ESTA sala. Fuente del scope:
 * si role === null, la persona no participa en la sala (403).
 */
export async function resolveRoomActor(projectId: string): Promise<RoomActor> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  const clerkId = user?.id ?? null;

  // José / platform admin: PM en cualquier sala.
  if (user && (isAdminUser(user.id) || isAdminEmail(email ?? ""))) {
    return { email, clerkId, personId: null, role: "pm", isSuperAdmin: true };
  }
  if (!email && !clerkId) {
    return { email: null, clerkId: null, personId: null, role: null, isSuperAdmin: false };
  }

  // Membresía activa por email (los clientes/colaboradores externos entran por email Clerk).
  // TODO: cuando exista un mapa user↔person, resolver también por person_id.
  const { data } = await supabaseAdmin()
    .from("project_members")
    .select("role, person_id")
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .ilike("user_email", email ?? "")
    .limit(1)
    .maybeSingle();

  return {
    email,
    clerkId,
    personId: (data?.person_id as string | null) ?? null,
    role: (data?.role as RoomRole | null) ?? null,
    isSuperAdmin: false,
  };
}

/**
 * Emite un evento al event log inmutable (project_events).
 * Todo cambio de la capa de trabajo pasa por acá: de esto salen undo,
 * atestiguación, auditoría, analítica y el feed. Best-effort (no rompe la request).
 */
export async function logRoomEvent(input: {
  projectId: string;
  actor: RoomActor;
  verb: string;         // created | updated | status_changed | moved | closed | accepted | confirmed ...
  targetType: string;   // deliverable | task | decision | phase | material | suggestion | room
  targetId?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
  evidenceRef?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin().from("project_events").insert({
      project_id: input.projectId,
      actor_person_id: input.actor.personId,
      actor_email: input.actor.email,
      actor_role: input.actor.role,
      verb: input.verb,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      summary: input.summary ?? null,
      payload: input.payload ?? null,
      evidence_ref: input.evidenceRef ?? null,
    });
  } catch {
    // El event log es best-effort: no debe tumbar la operación de negocio.
  }
}
