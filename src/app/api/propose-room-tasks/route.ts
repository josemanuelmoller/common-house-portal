/**
 * GET|POST /api/propose-room-tasks
 *
 * El puente entre la capa de inteligencia y la capa de trabajo de la sala.
 *
 * Los ingestores (Gmail, Fireflies, calendario) destilan compromisos en
 * action_items. Hasta ahora esa señal moría ahí: la sala lee project_tasks y
 * nadie escribía en esa tabla salvo a mano, así que 134 items abiertos vivían
 * fuera de toda superficie por proyecto.
 *
 * Esta rutina propone — no decide. Cada action_item abierto con proyecto se
 * convierte en un project_state_proposals de kind 'add_task' que aparece en la
 * bandeja "la IA propone" de la sala. Recién cuando el PM confirma, el RPC
 * apply_state_proposal crea la tarea y cierra el action_item de origen.
 *
 * Dedup: índice único parcial sobre payload->>'action_item_id' para
 * kind='add_task' y status in (pending, accepted). Un item no se propone dos
 * veces, y si la propuesta fue rechazada sí puede volver a proponerse cuando
 * llegue señal nueva.
 *
 * Gate: solo items con project_id. Sin proyecto no hay sala donde ponerlo —
 * ese hueco lo cierra backfill-action-item-projects, no esta rutina.
 *
 * Auth: CRON_SECRET (Bearer / x-agent-key) o sesión admin.
 * Escribe solo con ?execute=true; por defecto reporta sin tocar nada.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { adminGuardApi } from "@/lib/require-admin";
import { withRoutineLog } from "@/lib/routine-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    if (req.headers.get("x-agent-key") === expected) return true;
    if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  }
  return (await adminGuardApi()) === null;
}

type Item = {
  id: string;
  subject: string;
  next_action: string | null;
  counterparty: string | null;
  project_id: string;
  owner_person_id: string | null;
  deadline: string | null;
  consequence: string | null;
  priority_score: number | null;
  source_type: string;
  source_id: string;
  ball_in_court: string | null;
};

/** priority_score (0-100) → impact de la propuesta. */
function impactFor(score: number | null): "low" | "medium" | "high" | "critical" {
  if (score === null) return "medium";
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qs = req.nextUrl.searchParams;
  const execute = qs.get("execute") === "true";
  const limit = Math.min(Math.max(Number(qs.get("limit")) || 100, 1), 500);

  const sb = getSupabaseServerClient();

  const { data, error } = await sb
    .from("action_items")
    .select("id, subject, next_action, counterparty, project_id, owner_person_id, deadline, consequence, priority_score, source_type, source_id, ball_in_court")
    .eq("status", "open")
    .not("project_id", "is", null)
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const items = (data ?? []) as Item[];
  if (items.length === 0) {
    return NextResponse.json({ execute, scanned: 0, proposed: 0, skipped: 0, items: [] });
  }

  // Ya propuestos (pending o accepted) — el índice único los rechazaría igual,
  // pero filtrar acá evita ruido en el reporte del dry-run.
  const { data: existing } = await sb
    .from("project_state_proposals")
    .select("payload")
    .eq("proposal_kind", "add_task")
    .in("status", ["pending", "accepted"]);
  const already = new Set(
    ((existing ?? []) as Array<{ payload: { action_item_id?: string } | null }>)
      .map((r) => r.payload?.action_item_id)
      .filter((x): x is string => !!x),
  );

  const fresh = items.filter((i) => !already.has(i.id));
  const report: Array<{ action_item_id: string; project_id: string; title: string }> = [];
  const errors: string[] = [];
  let proposed = 0;

  for (const item of fresh) {
    // El título de la tarea es la acción concreta cuando existe; el subject es
    // el resumen del hilo y sirve de contexto, no de tarea.
    const title = (item.next_action ?? item.subject).trim().slice(0, 300);
    if (!title) continue;

    // ball_in_court dice de qué lado cae: si la pelota es de la contraparte, la
    // tarea nace del lado cliente.
    const side = item.ball_in_court === "them" ? "client" : "team";

    const rationale = [
      item.consequence ? `Consecuencia si no se hace: ${item.consequence}` : null,
      item.counterparty ? `Contraparte: ${item.counterparty}` : null,
      `Detectado en ${item.source_type}`,
    ].filter(Boolean).join(". ");

    const row = {
      project_id: item.project_id,
      proposal_kind: "add_task",
      item_type: "task",
      summary: title,
      rationale: rationale || "Compromiso detectado en la ingesta.",
      impact: impactFor(item.priority_score),
      confidence: Math.max(0, Math.min(100, item.priority_score ?? 50)),
      source_refs: [`${item.source_type}:${item.source_id}`],
      status: "pending",
      generated_by: "propose-room-tasks",
      payload: {
        action_item_id: item.id,
        title,
        assignee_side: side,
        due_date: item.deadline ? String(item.deadline).slice(0, 10) : null,
        owner_person_id: item.owner_person_id,
        evidence_ref: `${item.source_type}:${item.source_id}`,
      },
    };

    report.push({ action_item_id: item.id, project_id: item.project_id, title });

    if (execute) {
      const { error: insErr } = await sb.from("project_state_proposals").insert(row);
      if (insErr) {
        // 23505 = el índice único ganó una carrera. No es un fallo.
        if (insErr.code !== "23505") errors.push(`${item.id}: ${insErr.message}`);
      } else {
        proposed++;
      }
    }
  }

  return NextResponse.json({
    execute,
    scanned: items.length,
    skipped: items.length - fresh.length,
    matched: report.length,
    proposed,
    ...(errors.length ? { errors } : {}),
    items: report.slice(0, 50),
  });
}

// `scanned` → records_read, `proposed` → records_written en routine_runs.
export const POST = withRoutineLog("propose-room-tasks", handle);
export const GET = POST;
