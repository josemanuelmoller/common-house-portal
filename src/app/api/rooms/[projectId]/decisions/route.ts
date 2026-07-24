import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";

/** Decisiones de la sala. Ver: todos. Registrar: PM/colaborador. Resolver: quien tenga el permiso. */

async function ctxFor(projectId: string) {
  const project = await resolveClientRoomProject(projectId);
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return { error: NextResponse.json({ error: "Not a member of this room" }, { status: 403 }) };
  return { project, actor };
}

export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "room.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error: dbError } = await supabaseAdmin()
    .from("project_decisions").select("*").eq("project_id", project.id).order("position", { ascending: true });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });
  return NextResponse.json({ ok: true, decisions: data });
}

// Registrar una decisión — PM / colaborador.
export async function POST(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "decision.manage")) return NextResponse.json({ error: "Tu rol no puede registrar decisiones" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const { data, error: dbError } = await supabaseAdmin()
    .from("project_decisions")
    .insert({
      project_id: project.id,
      deliverable_id: typeof body.deliverableId === "string" ? body.deliverableId : null,
      title,
      context: typeof body.context === "string" ? body.context.trim() || null : null,
      source_ref: typeof body.sourceRef === "string" ? body.sourceRef.trim() || null : null,
      participants: Array.isArray(body.participants) ? body.participants : null,
      position: typeof body.position === "number" ? body.position : 0,
    })
    .select("*").single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });

  await logRoomEvent({ projectId: project.id, actor, verb: "created", targetType: "decision", targetId: data.id, summary: `Registró la decisión "${title}"`, payload: { title } });
  return NextResponse.json({ ok: true, decision: data });
}

// Resolver / reabrir una decisión.
export async function PATCH(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id) return NextResponse.json({ error: "A decision id is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: current, error: readErr } = await db
    .from("project_decisions").select("*").eq("id", id).eq("project_id", project.id).single();
  if (readErr || !current) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  if (action === "resolve") {
    if (!(can(actor.role, "decision.manage") || can(actor.role, "decision.resolve_own"))) {
      return NextResponse.json({ error: "Tu rol no puede resolver esta decisión" }, { status: 403 });
    }
    const { data, error: upErr } = await db.from("project_decisions")
      .update({ status: "closed", resolved_by: actor.email ?? actor.clerkId, resolved_at: new Date().toISOString() })
      .eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "resolved", targetType: "decision", targetId: id, summary: `Resolvió "${current.title}"` });
    return NextResponse.json({ ok: true, decision: data });
  }

  if (action === "reopen") {
    if (!can(actor.role, "decision.manage")) return NextResponse.json({ error: "Tu rol no puede reabrir decisiones" }, { status: 403 });
    const { data, error: upErr } = await db.from("project_decisions").update({ status: "open", resolved_by: null, resolved_at: null }).eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "reopened", targetType: "decision", targetId: id, summary: `Reabrió "${current.title}"` });
    return NextResponse.json({ ok: true, decision: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
