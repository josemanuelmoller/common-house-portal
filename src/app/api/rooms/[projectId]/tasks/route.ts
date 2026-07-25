import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor, type RoomActor } from "@/lib/project-roles";
import { buildPatch, fieldDiff, DATE_RE, UUID_RE } from "@/lib/room-patch";

/**
 * CRUD de tareas de la sala, con permisos por rol (matriz) y event log.
 * - Mover en kanban (status) → task.move (cliente/lector: 403).
 * - Editar campos → task.crud (mismo permiso que crear).
 * - Cerrar → task.mark_own (propia) o task.manage. Cierre por evidencia o atestiguación
 *   ("sin evidencia, no hay bloque": si no hay evidencia digital, la persona atestigua y es la evidencia).
 */

const STATUSES = new Set(["todo", "doing", "blocked", "done"]);
const SIDES = new Set(["team", "client"]);

async function ctxFor(projectId: string) {
  const project = await resolveClientRoomProject(projectId);
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return { error: NextResponse.json({ error: "Not a member of this room" }, { status: 403 }) };
  return { project, actor };
}

/** ¿La tarea es "de esta persona"? (para task.mark_own) */
function ownsTask(actor: RoomActor, task: { owner_person_id: string | null; assignee_side: string }): boolean {
  if (task.owner_person_id && actor.personId && task.owner_person_id === actor.personId) return true;
  if (actor.role === "client" && task.assignee_side === "client") return true;
  return false;
}

// ─── GET: listar tareas ────────────────────────────────────────────────────
export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "room.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error: dbError } = await supabaseAdmin()
    .from("project_tasks")
    .select("*")
    .eq("project_id", project.id)
    .order("position", { ascending: true });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });
  return NextResponse.json({ ok: true, tasks: data });
}

// ─── POST: crear / asignar tarea ───────────────────────────────────────────
export async function POST(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "task.crud")) return NextResponse.json({ error: "Tu rol no puede crear tareas" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const assigneeSide = typeof body.assigneeSide === "string" && SIDES.has(body.assigneeSide) ? body.assigneeSide : "team";
  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "todo";
  const { data, error: dbError } = await supabaseAdmin()
    .from("project_tasks")
    .insert({
      project_id: project.id,
      deliverable_id: typeof body.deliverableId === "string" ? body.deliverableId : null,
      title,
      status,
      owner_person_id: typeof body.ownerPersonId === "string" ? body.ownerPersonId : null,
      assignee_side: assigneeSide,
      start_date: typeof body.startDate === "string" ? body.startDate || null : null,
      due_date: typeof body.dueDate === "string" ? body.dueDate || null : null,
      depends_on: typeof body.dependsOn === "string" ? body.dependsOn : null,
      position: typeof body.position === "number" ? body.position : 0,
    })
    .select("*")
    .single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });

  await logRoomEvent({ projectId: project.id, actor, verb: "created", targetType: "task", targetId: data.id, summary: `Creó la tarea "${title}"`, payload: { title, assignee_side: assigneeSide } });
  return NextResponse.json({ ok: true, task: data });
}

// ─── PATCH: mover (kanban) / cerrar (evidencia|atestiguación) / reabrir ─────
export async function PATCH(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id) return NextResponse.json({ error: "A task id is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: current, error: readErr } = await db
    .from("project_tasks").select("*").eq("id", id).eq("project_id", project.id).single();
  if (readErr || !current) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Mover en kanban (cambio de estado) — pm, colaborador. Cliente/lector: no.
  if (action === "move") {
    if (!can(actor.role, "task.move")) return NextResponse.json({ error: "Tu rol no puede mover tareas" }, { status: 403 });
    const to = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "";
    if (!to) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const patch: Record<string, unknown> = { status: to };
    if (to !== "done") { patch.closed_at = null; patch.closed_via = null; patch.closed_by = null; patch.evidence_ref = null; }
    const { data, error: upErr } = await db.from("project_tasks").update(patch).eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "status_changed", targetType: "task", targetId: id, summary: `Movió "${current.title}" a ${to}`, payload: { from: current.status, to } });
    return NextResponse.json({ ok: true, task: data });
  }

  // Cerrar — task.manage (cualquiera) o task.mark_own (propia). Evidencia o atestiguación.
  if (action === "close") {
    const allowed = can(actor.role, "task.manage") || (can(actor.role, "task.mark_own") && ownsTask(actor, current));
    if (!allowed) return NextResponse.json({ error: "Tu rol no puede cerrar esta tarea" }, { status: 403 });
    const evidenceRef = typeof body.evidenceRef === "string" && body.evidenceRef.trim() ? body.evidenceRef.trim() : null;
    const closedVia = evidenceRef ? "evidence" : "attestation";
    const closedBy = actor.email ?? actor.clerkId;
    const { data, error: upErr } = await db.from("project_tasks")
      .update({ status: "done", closed_at: new Date().toISOString(), closed_via: closedVia, closed_by: closedBy, evidence_ref: evidenceRef })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({
      projectId: project.id, actor, verb: "closed", targetType: "task", targetId: id,
      summary: closedVia === "evidence" ? `Cerró "${current.title}" con evidencia` : `Cerró "${current.title}" (atestiguada por ${closedBy})`,
      payload: { closed_via: closedVia }, evidenceRef,
    });
    return NextResponse.json({ ok: true, task: data });
  }

  // Reabrir — task.manage o dueño.
  if (action === "reopen") {
    const allowed = can(actor.role, "task.manage") || (can(actor.role, "task.mark_own") && ownsTask(actor, current));
    if (!allowed) return NextResponse.json({ error: "Tu rol no puede reabrir esta tarea" }, { status: 403 });
    const { data, error: upErr } = await db.from("project_tasks")
      .update({ status: "todo", closed_at: null, closed_via: null, closed_by: null, evidence_ref: null })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "reopened", targetType: "task", targetId: id, summary: `Reabrió "${current.title}"` });
    return NextResponse.json({ ok: true, task: data });
  }

  // Editar campos — task.crud (mismo permiso que crear). Cliente/lector: 403.
  if (action === "update") {
    if (!can(actor.role, "task.crud")) return NextResponse.json({ error: "Tu rol no puede editar tareas" }, { status: 403 });

    const built = buildPatch(body, [
      { key: "title", col: "title", label: "Título", required: true },
      { key: "ownerPersonId", col: "owner_person_id", label: "Responsable", check: (v) => UUID_RE.test(v) },
      { key: "assigneeSide", col: "assignee_side", label: "Parte responsable", required: true, check: (v) => SIDES.has(v) },
      { key: "deliverableId", col: "deliverable_id", label: "Entregable", check: (v) => UUID_RE.test(v) },
      { key: "dependsOn", col: "depends_on", label: "Depende de", check: (v) => UUID_RE.test(v) },
      { key: "startDate", col: "start_date", label: "Inicio", check: (v) => DATE_RE.test(v) },
      { key: "dueDate", col: "due_date", label: "Fecha", check: (v) => DATE_RE.test(v) },
    ]);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
    if (built.touched.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    // Guarda de un salto: bloquea A→A y A→B cuando B ya depende de A. Cadenas
    // más largas (A→B→C→A) todavía pasan; no hay recorrido de la cadena entera.
    if (built.patch.depends_on) {
      if (built.patch.depends_on === id) return NextResponse.json({ error: "Una tarea no puede depender de sí misma" }, { status: 400 });
      const { data: dep } = await db.from("project_tasks").select("id, depends_on").eq("id", built.patch.depends_on).eq("project_id", project.id).maybeSingle();
      if (!dep) return NextResponse.json({ error: "La dependencia no existe en esta sala" }, { status: 400 });
      if (dep.depends_on === id) return NextResponse.json({ error: "Esa dependencia crearía un ciclo" }, { status: 400 });
    }
    // El entregable tiene que ser de esta sala (el id viene del cliente).
    if (built.patch.deliverable_id) {
      const { data: del } = await db.from("project_deliverables").select("id").eq("id", built.patch.deliverable_id).eq("project_id", project.id).maybeSingle();
      if (!del) return NextResponse.json({ error: "El entregable no existe en esta sala" }, { status: 400 });
    }

    const diff = fieldDiff(current, built.patch);
    if (Object.keys(diff).length === 0) return NextResponse.json({ ok: true, task: current, unchanged: true });

    const { data, error: upErr } = await db.from("project_tasks")
      .update({ ...built.patch, updated_at: new Date().toISOString() })
      .eq("id", id).eq("project_id", project.id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

    await logRoomEvent({
      projectId: project.id, actor, verb: "updated", targetType: "task", targetId: id,
      summary: `Editó "${current.title}" (${Object.keys(diff).join(", ")})`,
      payload: { changes: diff },
    });
    return NextResponse.json({ ok: true, task: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
