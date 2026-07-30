import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { attachSources, type SuggestionRow } from "@/lib/proposal-sources";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";
import { acceptProposal, describeProposalChange, rejectProposal } from "@/lib/state-proposals";

/**
 * Bandeja "la IA propone" (inbox del Resumen). Lista y resuelve sugerencias
 * pendientes (project_state_proposals). Confirmar/Descartar = gate humano: nada
 * se aplica sin el ✓ del PM (suggestion.confirm).
 *
 * Confirmar corre `apply_state_proposal` (misma RPC atómica que /admin), que es
 * lo único que mueve el estado del proyecto. Marcar la propuesta como accepted
 * a mano —como hacía esta ruta— la sacaba de 'pending' sin aplicar nada y la
 * dejaba imposible de aplicar después: la RPC exige 'pending'.
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
  // Cada propuesta viaja con la evidencia que la justifica: aceptar sin ver de
  // dónde salió es avalar la atribución a ciegas.
  const suggestions = await attachSources((data ?? []) as SuggestionRow[], project.notion_id ?? null);
  return NextResponse.json({ ok: true, suggestions });
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

  const actorId = actor.email ?? actor.clerkId ?? "unknown-room-actor";

  // El antes/después se captura acá, con la propuesta todavía pendiente.
  const change = await describeProposalChange(project.id, id);
  if (!change) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });

  const result = action === "confirm"
    ? await acceptProposal(project.id, id, actorId)
    : await rejectProposal(project.id, id, actorId, null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await logRoomEvent({
    projectId: project.id,
    actor,
    verb: action === "confirm" ? "confirmed" : "rejected",
    targetType: "suggestion",
    targetId: id,
    summary: `${action === "confirm" ? "Confirmó" : "Descartó"} la sugerencia "${change.summary}"`,
    payload: action === "confirm"
      ? { kind: change.kind, item_type: change.itemType, before: change.before, after: change.after }
      : { kind: change.kind, item_type: change.itemType },
  });

  return NextResponse.json({
    ok: true,
    kind: result.kind,
    change: action === "confirm" ? { before: change.before, after: change.after } : null,
  });
}
