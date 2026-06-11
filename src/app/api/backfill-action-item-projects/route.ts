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
 * Input body (all optional):
 *   - dry_run: boolean (default TRUE — report matches without writing)
 *   - limit: number (default 200)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { adminGuardApi } from "@/lib/require-admin";
import { loadProjectLinkage, resolveProjectIdForSignal } from "@/lib/ingestors/project-linkage";

export const dynamic = "force-dynamic";
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
};

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dry_run?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const dryRun = body.dry_run ?? true;
  const limit  = Math.min(Math.max(body.limit ?? 200, 1), 1000);

  const sb = getSupabaseServerClient();

  const { data, error } = await sb
    .from("action_items")
    .select("id, subject, next_action, counterparty, source_type, source_id")
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
    // that), so try explicit-only first, then inference-only.
    const projectId = explicitNotionId
      ? resolveProjectIdForSignal(linkage, { projectNotionId: explicitNotionId })
      : resolveProjectIdForSignal(linkage, { inferText });
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
