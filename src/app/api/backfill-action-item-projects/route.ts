/**
 * POST /api/backfill-action-item-projects
 *
 * One-shot backfill: resolves project_id for OPEN action_items rows that
 * have none, using the same conservative resolution the ingestors now apply
 * at write time (see src/lib/ingestors/project-linkage.ts):
 *
 *   1. explicit — Fireflies items: source_id is an evidence.id; when that
 *      evidence row carries project_notion_id, map it to projects.id.
 *   2. inferred — unambiguous name match between the item's text
 *      (subject + next_action + counterparty — same text the STB candidate
 *      layer uses) and active project names. Ambiguous → untouched.
 *
 * Never overwrites: only rows with project_id IS NULL are considered, and
 * the UPDATE re-checks the null so a concurrent ingestor write wins.
 *
 * Auth: admin session OR CRON_SECRET (Bearer / x-agent-key).
 *
 * Runs nightly via Vercel cron with ?execute=true. It was a one-shot before
 * 2026-07-25 and the debt simply rebuilt: 29 open Fireflies items were sitting
 * on evidence that already named their project. Unlinked items are invisible
 * to every per-project surface, so this has to run on a schedule, not by hand.
 *
 * Input (body on POST, query string on either verb — query wins):
 *   - dry_run / ?execute=true : default DRY RUN (report matches without
 *     writing). ?execute=true is the house convention for scheduled writes.
 *   - limit: number (default 200)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { adminGuardApi } from "@/lib/require-admin";
import { loadProjectLinkage, resolveProjectIdForSignal } from "@/lib/ingestors/project-linkage";
import { withRoutineLog } from "@/lib/routine-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && (agentKey === expected || cronKey === `Bearer ${expected}`)) return true;
  const denied = await adminGuardApi();
  return denied === null;
}

type OpenItem = {
  id: string;
  subject: string;
  next_action: string | null;
  counterparty: string | null;
  source_type: string;
  source_id: string;
  counterparty_contact_id: string | null;
};

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dry_run?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body / GET — ok */ }

  // Query string wins over body so the cron entry (?execute=true) is the single
  // visible source of truth for whether a scheduled run writes.
  const qs = req.nextUrl.searchParams;
  const dryRun = qs.get("execute") === "true" ? false : (body.dry_run ?? true);
  const limit  = Math.min(Math.max(Number(qs.get("limit")) || body.limit || 200, 1), 1000);

  const sb = getSupabaseServerClient();

  const { data, error } = await sb
    .from("action_items")
    .select("id, subject, next_action, counterparty, source_type, source_id, counterparty_contact_id")
    .eq("status", "open")
    .is("project_id", null)
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []) as OpenItem[];
  if (items.length === 0) {
    return NextResponse.json({ dry_run: dryRun, scanned: 0, matched: 0, updated: 0, items: [] });
  }

  const linkage = await loadProjectLinkage();
  if (!linkage) {
    return NextResponse.json({ error: "active-project load failed — see logs" }, { status: 500 });
  }
  const nameById = new Map(linkage.projects.map(p => [p.id, p.name]));

  // Fireflies items reference evidence rows that may carry an explicit
  // project_notion_id — fetch those in one batch.
  const evidenceIds = items.filter(i => i.source_type === "fireflies").map(i => i.source_id);
  const evidenceProject = new Map<string, string | null>();
  if (evidenceIds.length > 0) {
    const { data: evs } = await sb
      .from("evidence")
      .select("id, project_notion_id")
      .in("id", evidenceIds);
    for (const e of (evs ?? []) as Array<{ id: string; project_notion_id: string | null }>) {
      evidenceProject.set(e.id, e.project_notion_id);
    }
  }

  // Correo de cada contraparte, para el salto dominio→organización→proyecto.
  // Los items de calendario llegan acá sin proyecto y con contacto resuelto, así
  // que este es el camino por el que se enganchan.
  const personIds = [...new Set(items.map(i => i.counterparty_contact_id).filter((x): x is string => !!x))];
  const emailByPerson = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: people } = await sb.from("people").select("id, email").in("id", personIds);
    for (const p of (people ?? []) as Array<{ id: string; email: string | null }>) {
      if (p.email) emailByPerson.set(p.id, p.email);
    }
  }

  const report: Array<{
    id: string; subject: string; method: "explicit" | "inferred";
    project_id: string; project_name: string;
  }> = [];
  const errors: string[] = [];
  let updated = 0;

  for (const item of items) {
    const explicitNotionId = item.source_type === "fireflies"
      ? evidenceProject.get(item.source_id) ?? null
      : null;
    const inferText = `${item.subject} ${item.next_action ?? ""} ${item.counterparty ?? ""}`;

    // Same precedence as ingest: explicit linkage wins; an explicit pointer
    // to a dead project blocks inference (resolveProjectIdForSignal handles
    // that), so try explicit-only first, then inference + domain.
    const projectId = explicitNotionId
      ? resolveProjectIdForSignal(linkage, { projectNotionId: explicitNotionId })
      : resolveProjectIdForSignal(linkage, {
          inferText,
          counterpartyEmail: emailByPerson.get(item.counterparty_contact_id ?? "") ?? null,
        });
    if (!projectId) continue;

    report.push({
      id: item.id,
      subject: item.subject,
      method: explicitNotionId ? "explicit" : "inferred",
      project_id: projectId,
      project_name: nameById.get(projectId) ?? "(unknown)",
    });

    if (!dryRun) {
      // .is("project_id", null) re-check: a concurrent ingestor write wins.
      const { error: updErr } = await sb
        .from("action_items")
        .update({ project_id: projectId })
        .eq("id", item.id)
        .is("project_id", null);
      if (updErr) errors.push(`${item.id}: ${updErr.message}`);
      else updated++;
    }
  }

  return NextResponse.json({
    dry_run: dryRun,
    scanned: items.length,
    matched: report.length,
    updated,
    ...(errors.length ? { errors } : {}),
    items: report,
  });
}

// `scanned` → records_read, `updated` → records_written in routine_runs.
export const POST = withRoutineLog("backfill-action-item-projects", handle);
// Vercel cron fires GET; same wrapped handler, gated by ?execute=true.
export const GET = POST;
