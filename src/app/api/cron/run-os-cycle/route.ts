/**
 * Cron route: run the OS v2 maintenance cadence in a single sequenced pass.
 *
 * Replaces the fragmented per-operator cron schedule (validation-operator at
 * 03:00, project-operator at 05:00, evidence-to-knowledge at 04:00, etc.)
 * with one orchestrator that walks the steps in order and short-circuits
 * cleanly when a stage has nothing to do.
 *
 * The legacy per-operator crons remain in vercel.json for now — they are
 * harmless to run alongside this orchestrator (each operator is idempotent
 * and gates on `validation_status` / `processing_status` deltas). After one
 * week of stable runs of `/api/cron/run-os-cycle`, the legacy entries can be
 * removed in a follow-up commit.
 *
 * Auth: CRON_SECRET (Vercel cron sets `Authorization: Bearer <CRON_SECRET>`)
 *       or `x-agent-key: <CRON_SECRET>` for manual / agent triggers.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRoutineLog } from "@/lib/routine-log";
import { adminGuardApi } from "@/lib/require-admin";

export const maxDuration = 600;
export const dynamic = "force-dynamic";

type StepResult = {
  step: string;
  status: "ok" | "skipped" | "error";
  duration_ms: number;
  detail?: unknown;
  error?: string;
};

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const xAgent = req.headers.get("x-agent-key") ?? "";
    if (auth === `Bearer ${secret}` || xAgent === secret) return true;
  }
  // Allow admin-session trigger for the manual "Run pipeline" button.
  const denied = await adminGuardApi();
  return denied === null;
}

async function callOperator(path: string, body?: Record<string, unknown>): Promise<StepResult> {
  const t0 = Date.now();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.wearecommonhouse.com";
  const secret = process.env.CRON_SECRET ?? "";
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-key": secret,
        Authorization: `Bearer ${secret}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const detail = await res.json().catch(() => ({}));
    return {
      step: path,
      status: res.ok ? "ok" : "error",
      duration_ms: Date.now() - t0,
      detail,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      step: path,
      status: "error",
      duration_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const results: StepResult[] = [];

  // Step 1 — source-intake: ingest Gmail (Fireflies / Calendar / Loops / Drive
  // run on their own schedules and feed `sources` independently).
  results.push(await callOperator("/api/ingest-gmail"));

  // Step 2 — extract evidence from new Ingested sources (meetings + threads).
  results.push(await callOperator("/api/extract-meeting-evidence"));
  results.push(await callOperator("/api/extract-conversation-evidence"));

  // Step 4 — validation. (Step 3 — db-hygiene — is currently driven by the
  // db-hygiene-operator agent invoked manually; the autonomous cadence skips
  // it until the operator has an HTTP entrypoint.)
  results.push(await callOperator("/api/validation-operator"));

  // Step 5 — project status updates from newly Validated material evidence.
  results.push(await callOperator("/api/project-operator"));

  // Step 6 — knowledge_assets proposals from Reusable/Canonical evidence.
  results.push(await callOperator("/api/evidence-to-knowledge"));

  // Step 7 — knowledge_nodes tree writes from all Validated evidence.
  results.push(await callOperator("/api/knowledge-curator"));

  const ok_count   = results.filter(r => r.status === "ok").length;
  const err_count  = results.filter(r => r.status === "error").length;
  const skip_count = results.filter(r => r.status === "skipped").length;

  return NextResponse.json({
    ok: err_count === 0,
    duration_ms: Date.now() - t0,
    summary: {
      total: results.length,
      ok: ok_count,
      errors: err_count,
      skipped: skip_count,
    },
    results,
  });
}

export const POST = withRoutineLog("cron-run-os-cycle", handle);
export const GET  = POST;
