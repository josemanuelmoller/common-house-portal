/**
 * POST /api/backfill-case-codes
 *
 * Assigns case_code to evidence rows that don't have one, deterministically
 * from project_name + geography + date_captured. Creates/updates the
 * knowledge_cases registry row for each unique code discovered.
 *
 * Idempotent: re-running updates evidence_count / last_seen on existing cases
 * but does not overwrite evidence that already has a code.
 *
 * Auth: admin session OR CRON_SECRET.
 *
 * Input body (all optional):
 *   - since_days: number (default 365) — only process evidence newer than this
 *   - only_missing: boolean (default true)
 *   - dry_run: boolean (default false)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { generateCaseCode } from "@/lib/case-codes";
import { withRoutineLog } from "@/lib/routine-log";
import { adminGuardApi } from "@/lib/require-admin";

export const maxDuration = 180;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && (agentKey === expected || cronKey === `Bearer ${expected}`)) return true;
  const denied = await adminGuardApi();
  return denied === null;
}

type EvidenceRow = {
  notion_id: string;
  project_notion_id: string | null;
  geography: string | null;
  date_captured: string | null;
  workstream: string | null;
  case_code: string | null;
};

type ProjectRow = {
  notion_id: string;
  name: string | null;
};

async function _POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { since_days?: number; only_missing?: boolean; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty ok */ }

  const sinceDays  = body.since_days ?? 365;
  const onlyMissing = body.only_missing ?? true;
  const dryRun     = Boolean(body.dry_run);

  const sb = getSupabaseServerClient();

  // Fetch candidate evidence
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  let q = sb.from("evidence")
    .select("notion_id, project_notion_id, geography, date_captured, workstream, case_code")
    .eq("validation_status", "Validated")
    .gte("date_captured", since);
  if (onlyMissing) q = q.is("case_code", null);
  const { data: evs, error } = await q.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const evidence = (evs as EvidenceRow[]) ?? [];
  if (evidence.length === 0) {
    return NextResponse.json({ scanned: 0, assigned: 0, cases_touched: 0, skipped_no_inputs: 0 });
  }

  // Fetch projects for names
  const projIds = [...new Set(evidence.map(e => e.project_notion_id).filter((x): x is string => Boolean(x)))];
  const { data: projects } = await sb.from("projects")
    .select("notion_id, name")
    .in("notion_id", projIds);
  const projectByNotionId = new Map<string, ProjectRow>();
  for (const p of (projects as ProjectRow[] | null) ?? []) {
    projectByNotionId.set(p.notion_id, p);
  }

  const result = {
    scanned: evidence.length,
    assigned: 0,
    skipped_no_inputs: 0,
    errors: 0,
    cases_touched: 0,
    samples: [] as Array<{ evidence_id: string; case_code: string }>,
  };

  // Aggregate per-case stats in-memory, then upsert
  type CaseAcc = {
    code: string;
    project_notion_id: string | null;
    project_name: string | null;
    country: string;
    year: number;
    facet_key: string | null;
    evidence_count: number;
    first_seen: string | null;
    last_seen: string | null;
  };
  const caseAcc = new Map<string, CaseAcc>();

  for (const ev of evidence) {
    try {
      const project = ev.project_notion_id ? projectByNotionId.get(ev.project_notion_id) ?? null : null;
      const code = generateCaseCode({
        project_name: project?.name ?? null,
        geography: ev.geography,
        date_captured: ev.date_captured,
      });
      if (!code) { result.skipped_no_inputs++; continue; }

      if (!dryRun) {
        await sb.from("evidence")
          .update({ case_code: code, updated_at: new Date().toISOString() })
          .eq("notion_id", ev.notion_id);
      }
      result.assigned++;
      if (result.samples.length < 10) {
        result.samples.push({ evidence_id: ev.notion_id, case_code: code });
      }

      // Accumulate case registry data
      const parts = code.split("-");
      const country = parts[parts.length - 2] ?? "X";
      const year = parseInt(parts[parts.length - 1] ?? "0", 10);

      const existing = caseAcc.get(code);
      if (!existing) {
        caseAcc.set(code, {
          code,
          project_notion_id: project?.notion_id ?? null,
          project_name: project?.name ?? null,
          country,
          year: year || new Date().getFullYear(),
          facet_key: null, // Synthesiser / manual later
          evidence_count: 1,
          first_seen: ev.date_captured,
          last_seen: ev.date_captured,
        });
      } else {
        existing.evidence_count++;
        if (ev.date_captured && (!existing.first_seen || ev.date_captured < existing.first_seen)) {
          existing.first_seen = ev.date_captured;
        }
        if (ev.date_captured && (!existing.last_seen || ev.date_captured > existing.last_seen)) {
          existing.last_seen = ev.date_captured;
        }
      }
    } catch {
      result.errors++;
    }
  }

  // Upsert knowledge_cases
  if (!dryRun && caseAcc.size > 0) {
    const rows = [...caseAcc.values()].map(c => ({
      code: c.code,
      title: `${c.project_name ?? c.code} (${c.country} ${c.year})`,
      project_notion_id: c.project_notion_id,
      project_name: c.project_name,
      geography: c.country,
      year: c.year,
      facet_key: c.facet_key,
      evidence_count: c.evidence_count,
      first_seen: c.first_seen,
      last_seen: c.last_seen,
    }));
    const { error: upErr } = await sb.from("knowledge_cases")
      .upsert(rows, { onConflict: "code" });
    if (upErr) {
      console.error("[backfill-case-codes] upsert:", upErr.message);
    } else {
      result.cases_touched = rows.length;
    }
  }

  console.log("[backfill-case-codes]", { ...result, samples: undefined });
  return NextResponse.json(result);
}

export const POST = withRoutineLog("backfill-case-codes", _POST);
export const GET = POST;
