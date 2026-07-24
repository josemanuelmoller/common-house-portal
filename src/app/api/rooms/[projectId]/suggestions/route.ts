import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";

/**
 * Bandeja "la IA propone" (inbox del Resumen). Lista y resuelve sugerencias
 * pendientes (project_state_proposals). Confirmar/Descartar = gate humano: nada
 * se aplica sin el ✓ del PM (suggestion.confirm).
 */

export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const project = await resolveClientRoomProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  if (!can(actor.role, "suggestion.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin()
    .from("project_state_proposals")
    .select("id, proposal_kind, item_type, summary, rationale, source_refs, created_at")
    .eq("project_id", project.id).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, suggestions: data });
}

// Confirmar / descartar una sugerencia — solo PM (suggestion.confirm).
export async function PATCH(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const project = await resolveClientRoomProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  if (!can(actor.role, "suggestion.confirm")) return NextResponse.json({ error: "Solo el PM confirma sugerencias" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "confirm" ? "confirm" : body.action === "dismiss" ? "dismiss" : "";
  if (!id || !action) return NextResponse.json({ error: "id and action (confirm|dismiss) required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: cur } = await db.from("project_state_proposals").select("summary").eq("id", id).eq("project_id", project.id).maybeSingle();
  const status = action === "confirm" ? "accepted" : "rejected";
  const { error: upErr } = await db.from("project_state_proposals")
    .update({ status, reviewed_by: actor.email ?? actor.clerkId, reviewed_at: new Date().toISOString() })
    .eq("id", id).eq("project_id", project.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  await logRoomEvent({ projectId: project.id, actor, verb: action === "confirm" ? "confirmed" : "rejected", targetType: "suggestion", targetId: id, summary: `${action === "confirm" ? "Confirmó" : "Descartó"} la sugerencia "${cur?.summary ?? ""}"` });
  return NextResponse.json({ ok: true });
}
