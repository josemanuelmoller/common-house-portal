/**
 * Calendar ingestor HTTP entrypoint.
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 Calendar.
 */

import { NextRequest, NextResponse } from "next/server";
import { runCalendarIngestor } from "@/lib/ingestors/calendar";
import type { IngestInput } from "@/lib/ingestors/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function authCheck(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  if (req.headers.get("x-agent-key") === expected) return true;
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  return false;
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }

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
  const maxItems = maxRaw ? Math.max(1, Math.min(500, Number(maxRaw) || 80)) : undefined;
  const input: IngestInput = { mode, since, dryRun, maxItems };
  try {
    const r = await runCalendarIngestor(input);
    return NextResponse.json({
      ok: r.errors.length === 0,
      dry_run: r.dry_run,
      source_type: r.source_type,
      ingestor_version: r.ingestor_version,
      run_id: r.run_id,
      processed: r.processed,
      skipped: r.skipped,
      since_watermark: r.since_watermark,
      to_watermark: r.to_watermark,
      fallback_used: r.fallback_used,
      errors: r.errors,
      signals_preview: dryRun
        ? r.signals.map(s => ({
            kind: s.kind,
            source_id: s.source_id,
            payload: s.kind === "action"
              ? {
                  intent: s.payload.intent,
                  counterparty: s.payload.counterparty,
                  subject: s.payload.subject,
                  next_action: s.payload.next_action,
                  deadline: s.payload.deadline,
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
