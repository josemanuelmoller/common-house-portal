import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";

/**
 * Fases de la sala (estructural). PM crea/edita directo; colaborador sugiere. Resto: no.
 */

const STATUSES = new Set(["upcoming", "in_progress", "done"]);

async function ctxFor(projectId: string) {
  const project = await resolveClientRoomProject(projectId);
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return { error: NextResponse.json({ error: "Not a member of this room" }, { status: 403 }) };
  return { project, actor };
}

// ─── GET: listar fases ─────────────────────────────────────────────────────
export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "room.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error: dbError } = await supabaseAdmin()
    .from("project_phases").select("*").eq("project_id", project.id).order("position", { ascending: true });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });
  return NextResponse.json({ ok: true, phases: data });
}

// ─── POST: crear fase (estructural) ────────────────────────────────────────
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
      await logRoomEvent({ projectId: project.id, actor, verb: "suggested", targetType: "phase", summary: `Sugirió crear la fase "${title}"`, payload: { title } });
      return NextResponse.json({ ok: true, suggested: true, message: "Enviado como sugerencia — lo aprueba el PM" }, { status: 202 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "upcoming";
  const { data, error: dbError } = await supabaseAdmin()
    .from("project_phases")
    .insert({
      project_id: project.id,
      title,
      status,
      position: typeof body.position === "number" ? body.position : 0,
      starts_on: typeof body.startsOn === "string" ? body.startsOn || null : null,
      ends_on: typeof body.endsOn === "string" ? body.endsOn || null : null,
    })
    .select("*").single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });

  await logRoomEvent({ projectId: project.id, actor, verb: "created", targetType: "phase", targetId: data.id, summary: `Creó la fase "${title}"`, payload: { title, status } });
  return NextResponse.json({ ok: true, phase: data });
}

// ─── PATCH: editar fase (estado/título/orden) — estructural ────────────────
export async function PATCH(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "structure.edit")) return NextResponse.json({ error: "Tu rol no puede editar fases" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "A phase id is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: current, error: readErr } = await db
    .from("project_phases").select("*").eq("id", id).eq("project_id", project.id).single();
  if (readErr || !current) return NextResponse.json({ error: "Phase not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.status === "string" && STATUSES.has(body.status)) patch.status = body.status;
  if (typeof body.position === "number") patch.position = body.position;
  if (typeof body.startsOn === "string") patch.starts_on = body.startsOn || null;
  if (typeof body.endsOn === "string") patch.ends_on = body.endsOn || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error: upErr } = await db.from("project_phases").update(patch).eq("id", id).select("*").single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  const verb = patch.status && patch.status !== current.status ? "status_changed" : "updated";
  await logRoomEvent({ projectId: project.id, actor, verb, targetType: "phase", targetId: id, summary: `Actualizó la fase "${current.title}"`, payload: { changes: Object.keys(patch) } });
  return NextResponse.json({ ok: true, phase: data });
}
