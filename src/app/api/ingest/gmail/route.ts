/**
 * Gmail ingestor HTTP entrypoint.
 *
 * Cron-triggered (or manually triggered with CRON_SECRET). Runs the Gmail
 * ingestor once and returns the result summary.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 (Gmail) and §14 (security).
 * Auth pattern mirrors /api/sync-loops — `x-agent-key` or `Authorization: Bearer`.
 *
 * Query params:
 *   dry_run=1     → collect signals but do NOT write to action_items /
 *                   relationship_signals. Still writes an ingestor_runs row
 *                   so we can see what the run looked like.
 *   mode=backfill → caller-provided `since` is used, watermark is not
 *                   advanced on success. Defaults to `delta`.
 *   since=ISO     → override watermark (only meaningful in backfill mode).
 *   max=N         → cap the number of threads processed (default 100).
 */

import { NextRequest, NextResponse } from "next/server";
import { runGmailIngestor } from "@/lib/ingestors/gmail";
import type { IngestInput } from "@/lib/ingestors/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authCheck(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const agentKey = req.headers.get("x-agent-key");
  if (agentKey === expected) return true;
  const authz = req.headers.get("authorization");
  if (authz === `Bearer ${expected}`) return true;
  return false;
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun =
    url.searchParams.get("dry_run") === "1" ||
    url.searchParams.get("dryRun") === "1" ||
    process.env.INGEST_DRY_RUN === "1";
  const mode = (url.searchParams.get("mode") === "backfill" ? "backfill" : "delta") as
    | "delta" | "backfill";
  const since = url.searchParams.get("since") ?? undefined;
  const maxRaw = url.searchParams.get("max");
  const maxItems = maxRaw ? Math.max(1, Math.min(500, Number(maxRaw) || 100)) : undefined;

  const input: IngestInput = { mode, since, dryRun, maxItems };

  try {
    const result = await runGmailIngestor(input);

    // When dry-run, include the signal payloads so a human can eyeball them.
    // On real runs, return only counts to keep the response small.
    return NextResponse.json({
      ok: result.errors.length === 0,
      dry_run: result.dry_run,
      source_type: result.source_type,
      ingestor_version: result.ingestor_version,
      run_id: result.run_id,
      processed: result.processed,
      skipped: result.skipped,
      since_watermark: result.since_watermark,
      to_watermark: result.to_watermark,
      fallback_used: result.fallback_used,
      started_at: result.started_at,
      finished_at: result.finished_at,
      errors: result.errors,
      signals_preview: dryRun
        ? result.signals.map(s => ({
            kind: s.kind,
            source_id: s.source_id,
            payload: s.kind === "action"
              ? {
                  intent: s.payload.intent,
                  ball_in_court: s.payload.ball_in_court,
                  counterparty: s.payload.counterparty,
                  subject: s.payload.subject,
                  next_action: s.payload.next_action,
                  priority_factors: s.payload.priority_factors,
                }
              : {
                  contact_id: s.payload.contact_id,
                  direction: s.payload.direction,
                  at: s.payload.at,
                },
          }))
        : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
