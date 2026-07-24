import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";

/**
 * Aprobar la estructura inicial de la sala (gate del empty-state).
 * Solo el PM (room.configure). Materializa fases + entregables desde la
 * estructura sugerida, deja registro en project_state_proposals (aceptada) y
 * emite un evento. Solo aplica si la sala está vacía (no pisa estructura existente).
 */

type PhaseInput = { title: string; deliverables?: string[] };

export async function POST(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const project = await resolveClientRoomProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  if (!can(actor.role, "room.configure")) return NextResponse.json({ error: "Solo el PM puede aprobar la estructura" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const rawPhases = Array.isArray(body.phases) ? (body.phases as unknown[]) : [];
  const phases: PhaseInput[] = rawPhases
    .map((p) => (p && typeof p === "object" ? p as Record<string, unknown> : {}))
    .filter((p) => typeof p.title === "string" && (p.title as string).trim())
    .map((p) => ({
      title: (p.title as string).trim(),
      deliverables: Array.isArray(p.deliverables) ? (p.deliverables as unknown[]).filter((d): d is string => typeof d === "string" && d.trim().length > 0).map((d) => d.trim()) : [],
    }));
  if (phases.length === 0) return NextResponse.json({ error: "A non-empty structure is required" }, { status: 400 });

  const db = supabaseAdmin();

  // No pisar: la aprobación solo aplica cuando la sala está vacía.
  const { count: phaseCount } = await db.from("project_phases").select("id", { count: "exact", head: true }).eq("project_id", project.id);
  const { count: delivCount } = await db.from("project_deliverables").select("id", { count: "exact", head: true }).eq("project_id", project.id);
  if ((phaseCount ?? 0) > 0 || (delivCount ?? 0) > 0) {
    return NextResponse.json({ error: "La sala ya tiene estructura" }, { status: 409 });
  }

  let createdPhases = 0, createdDeliverables = 0;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const { data: phaseRow, error: pErr } = await db.from("project_phases")
      .insert({ project_id: project.id, title: p.title, status: i === 0 ? "in_progress" : "upcoming", position: i })
      .select("id").single();
    if (pErr || !phaseRow) return NextResponse.json({ error: pErr?.message ?? "Phase insert failed" }, { status: 502 });
    createdPhases++;
    const dels = p.deliverables ?? [];
    for (let j = 0; j < dels.length; j++) {
      const { error: dErr } = await db.from("project_deliverables")
        .insert({ project_id: project.id, phase_id: phaseRow.id, title: dels[j], status: "not_started", progress: 0, position: j });
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 502 });
      createdDeliverables++;
    }
  }

  // Registro auditable del gate (aceptada).
  await db.from("project_state_proposals").insert({
    project_id: project.id,
    proposal_kind: "room_structure",
    item_type: "structure",
    summary: `Estructura inicial aprobada — ${createdPhases} fases, ${createdDeliverables} entregables`,
    payload: { phases },
    status: "accepted",
    generated_by: "room-empty-state",
    reviewed_by: actor.email ?? actor.clerkId,
    reviewed_at: new Date().toISOString(),
  });

  await logRoomEvent({
    projectId: project.id, actor, verb: "confirmed", targetType: "room",
    summary: `Aprobó la estructura inicial (${createdPhases} fases · ${createdDeliverables} entregables)`,
    payload: { phases: createdPhases, deliverables: createdDeliverables },
  });

  return NextResponse.json({ ok: true, createdPhases, createdDeliverables });
}
