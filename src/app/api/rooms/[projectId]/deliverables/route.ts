import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";
import { buildPatch, fieldDiff, DATE_RE, UUID_RE } from "@/lib/room-patch";

/**
 * CRUD de entregables de la sala, con permisos por rol (matriz) y event log.
 * Cada cambio emite un project_events → de ahí salen undo, auditoría, analítica y feed.
 *
 * Editar parte el permiso en dos, siguiendo la matriz: cambiar qué ES el
 * entregable (título, descripción, fase) es estructural → structure.edit (PM).
 * Cambiar cómo VA (responsable, fecha, avance) es operativo → deliverable.move,
 * que el colaborador ya tiene.
 */

const STATUSES = new Set(["not_started", "in_progress", "at_risk", "delivered", "accepted"]);

async function ctxFor(projectId: string) {
  const project = await resolveClientRoomProject(projectId);
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return { error: NextResponse.json({ error: "Not a member of this room" }, { status: 403 }) };
  return { project, actor };
}

// ─── GET: listar entregables ───────────────────────────────────────────────
export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "room.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error: dbError } = await supabaseAdmin()
    .from("project_deliverables")
    .select("*")
    .eq("project_id", project.id)
    .order("position", { ascending: true });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });
  return NextResponse.json({ ok: true, deliverables: data });
}

// ─── POST: crear entregable (estructural) ──────────────────────────────────
// PM crea directo. Colaborador solo sugiere (va al flujo de aprobación del PM). Resto: 403.
export async function POST(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  if (!can(actor.role, "structure.edit")) {
    if (can(actor.role, "structure.suggest")) {
      // Estructural desde colaborador → propuesta para el PM (no se aplica directo).
      await logRoomEvent({ projectId: project.id, actor, verb: "suggested", targetType: "deliverable", summary: `Sugirió crear "${title}"`, payload: { title } });
      return NextResponse.json({ ok: true, suggested: true, message: "Enviado como sugerencia — lo aprueba el PM" }, { status: 202 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "not_started";
  const { data, error: dbError } = await supabaseAdmin()
    .from("project_deliverables")
    .insert({
      project_id: project.id,
      phase_id: typeof body.phaseId === "string" ? body.phaseId : null,
      title,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      status,
      owner_person_id: typeof body.ownerPersonId === "string" ? body.ownerPersonId : null,
      due_date: typeof body.dueDate === "string" ? body.dueDate || null : null,
      position: typeof body.position === "number" ? body.position : 0,
    })
    .select("*")
    .single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });

  await logRoomEvent({ projectId: project.id, actor, verb: "created", targetType: "deliverable", targetId: data.id, summary: `Creó el entregable "${title}"`, payload: { title, status } });
  return NextResponse.json({ ok: true, deliverable: data });
}

// ─── PATCH: mover en kanban (estado) / aceptar (sign-off) ──────────────────
export async function PATCH(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id) return NextResponse.json({ error: "A deliverable id is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: current, error: readErr } = await db
    .from("project_deliverables").select("*").eq("id", id).eq("project_id", project.id).single();
  if (readErr || !current) return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });

  // Mover en kanban (cambio de estado) — pm, colaborador. Cliente/lector: no.
  if (action === "move") {
    if (!can(actor.role, "deliverable.move")) return NextResponse.json({ error: "Tu rol no puede mover entregables" }, { status: 403 });
    const to = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "";
    if (!to) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const { data, error: upErr } = await db.from("project_deliverables").update({ status: to }).eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "status_changed", targetType: "deliverable", targetId: id, summary: `Movió "${current.title}" a ${to}`, payload: { from: current.status, to } });
    return NextResponse.json({ ok: true, deliverable: data });
  }

  // Aceptar / dar visto bueno — pm o cliente (su sign-off).
  if (action === "accept") {
    if (!can(actor.role, "deliverable.accept")) return NextResponse.json({ error: "Tu rol no puede aceptar entregables" }, { status: 403 });
    const { data, error: upErr } = await db.from("project_deliverables")
      .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: actor.email ?? actor.clerkId })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "accepted", targetType: "deliverable", targetId: id, summary: `Aceptó el entregable "${current.title}"`, payload: { by: actor.email } });
    return NextResponse.json({ ok: true, deliverable: data });
  }

  // Deshacer aceptación — vuelve a "entregado". Mismo permiso que aceptar.
  if (action === "revert_accept") {
    if (!can(actor.role, "deliverable.accept")) return NextResponse.json({ error: "Tu rol no puede revertir la aceptación" }, { status: 403 });
    const { data, error: upErr } = await db.from("project_deliverables")
      .update({ status: "delivered", accepted_at: null, accepted_by: null })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "status_changed", targetType: "deliverable", targetId: id, summary: `Deshizo la aceptación de "${current.title}"`, payload: { from: "accepted", to: "delivered" } });
    return NextResponse.json({ ok: true, deliverable: data });
  }

  // Editar campos. Permiso partido: estructural (PM) vs operativo (PM/colaborador).
  if (action === "update") {
    const built = buildPatch(body, [
      { key: "title", col: "title", label: "Título", required: true },
      { key: "description", col: "description", label: "Descripción" },
      { key: "phaseId", col: "phase_id", label: "Fase", check: (v) => UUID_RE.test(v) },
      { key: "ownerPersonId", col: "owner_person_id", label: "Responsable", check: (v) => UUID_RE.test(v) },
      { key: "dueDate", col: "due_date", label: "Fecha", check: (v) => DATE_RE.test(v) },
    ]);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

    const patch: Record<string, unknown> = { ...built.patch };
    const touched = [...built.touched];
    if ("progress" in body) {
      const n = typeof body.progress === "number" ? Math.round(body.progress) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: "Avance: 0 a 100" }, { status: 400 });
      patch.progress = n;
      touched.push("progress");
    }
    if (touched.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const STRUCTURAL = ["title", "description", "phase_id"];
    const needsStructural = touched.some((c) => STRUCTURAL.includes(c));
    if (needsStructural && !can(actor.role, "structure.edit")) {
      return NextResponse.json({ error: "Sólo el PM cambia título, descripción o fase" }, { status: 403 });
    }
    if (!needsStructural && !can(actor.role, "deliverable.move")) {
      return NextResponse.json({ error: "Tu rol no puede editar entregables" }, { status: 403 });
    }

    // La fase tiene que ser de esta sala (el id viene del cliente).
    if (patch.phase_id) {
      const { data: ph } = await db.from("project_phases").select("id").eq("id", patch.phase_id).eq("project_id", project.id).maybeSingle();
      if (!ph) return NextResponse.json({ error: "La fase no existe en esta sala" }, { status: 400 });
    }

    const diff = fieldDiff(current, patch);
    if (Object.keys(diff).length === 0) return NextResponse.json({ ok: true, deliverable: current, unchanged: true });

    const { data, error: upErr } = await db.from("project_deliverables")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id).eq("project_id", project.id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

    await logRoomEvent({
      projectId: project.id, actor, verb: "updated", targetType: "deliverable", targetId: id,
      summary: `Editó "${current.title}" (${Object.keys(diff).join(", ")})`,
      payload: { changes: diff },
    });
    return NextResponse.json({ ok: true, deliverable: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
