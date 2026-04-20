/**
 * routine-log.ts
 *
 * Lightweight observability wrapper for cron/scheduled API routes.
 *
 * Usage in each cron route:
 *
 *   async function _POST(req: NextRequest) { ... original handler body ... }
 *   export const POST = withRoutineLog("sync-evidence", _POST);
 *   // Vercel cron fires GET requests; delegate to the same wrapped handler
 *   export const GET = POST;
 *
 * Each invocation inserts one row into public.routine_runs with duration,
 * status, error message, and (best-effort) records_read / records_written
 * extracted from the route's JSON response body. If the Supabase insert
 * fails (missing env, network, etc.) the original response is returned
 * unchanged — observability must never block the underlying routine.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "./supabase-server";

export type RoutineStats = {
  records_read?: number;
  records_written?: number;
  notes?: string;
};

type Handler = (req: NextRequest) => Promise<Response>;

export function withRoutineLog(name: string, handler: Handler): Handler {
  return async (req: NextRequest): Promise<Response> => {
    const startedAt = new Date();
    const startMs = Date.now();

    let response: Response;
    let status: "success" | "error" = "success";
    let errorMessage: string | null = null;
    let stats: RoutineStats = {};
    let httpStatus = 200;

    try {
      response = await handler(req);
      httpStatus = response.status;

      // Inspect a clone of the body so we don't consume the response stream
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await response.clone().json();
        stats = extractStats(body);
        if (httpStatus >= 400) {
          status = "error";
          errorMessage =
            typeof body?.error === "string"
              ? body.error
              : typeof body?.detail === "string"
              ? body.detail
              : `HTTP ${httpStatus}`;
        }
      } catch {
        // Non-JSON response or empty body — leave stats empty
        if (httpStatus >= 400) {
          status = "error";
          errorMessage = `HTTP ${httpStatus}`;
        }
      }
    } catch (err) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      httpStatus = 500;
      response = NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const finishedAt = new Date();
    const durationMs = Date.now() - startMs;

    // Fire-and-forget insert. Do NOT await in the hot path longer than needed;
    // cron timeouts are short. We do await so failures land in server logs,
    // but we catch so the original response always returns.
    try {
      const sb = getSupabaseServerClient();
      const { error } = await sb.from("routine_runs").insert({
        routine_name: name,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        status,
        http_status: httpStatus,
        records_read: stats.records_read ?? null,
        records_written: stats.records_written ?? null,
        error_message: errorMessage,
        notes: stats.notes ?? null,
      });
      if (error) {
        console.error(
          `[routine-log:${name}] insert error: ${error.message}`
        );
      }
    } catch (e) {
      console.error(
        `[routine-log:${name}] supabase unavailable:`,
        e instanceof Error ? e.message : String(e)
      );
    }

    return response;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStats(body: any): RoutineStats {
  if (!body || typeof body !== "object") return {};

  // Heuristic extraction — CH cron routes use a mix of field names.
  // We check top-level first, then nested `stats` and `results` objects.
  const READ_KEYS = [
    "records_read", "read", "fetched", "fetched_from_notion", "fetched_count",
    "total", "count", "scanned", "processed", "checked", "queried",
    "people_checked", "threads_scanned", "sources_scanned", "evaluated",
  ];
  const WRITTEN_KEYS = [
    "records_written", "written", "upserted", "persisted",
    "sources_created", "sources_updated",
    "loops_created", "signals_added",
    "drafts_created", "drafts_updated",
  ];

  let read =
    pickNumber(body, READ_KEYS) ??
    pickNumber(body.stats, READ_KEYS) ??
    pickNumber(body.results, READ_KEYS);

  let written =
    pickNumber(body, WRITTEN_KEYS) ??
    pickNumber(body.stats, WRITTEN_KEYS) ??
    pickNumber(body.results, WRITTEN_KEYS);

  // Sum created/updated/inserted when those appear without an aggregate.
  if (written === undefined) {
    const sum =
      (firstNumber(body.created, body.stats?.created, body.results?.created) ?? 0) +
      (firstNumber(body.updated, body.stats?.updated, body.results?.updated) ?? 0) +
      (firstNumber(body.inserted, body.stats?.inserted, body.results?.inserted) ?? 0);
    if (sum > 0) written = sum;
  }

  return {
    records_read: read,
    records_written: written,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickNumber(obj: any, keys: string[]): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function firstNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

// ─── Static catalog of known routines ────────────────────────────────────────
//
// Metadata that doesn't live in the database — schedule, what the routine
// reads/writes, and whether its output surfaces in the product. Joined at
// render time with routine_latest_runs on routine_name.

export type RoutineCatalogEntry = {
  schedule: string;            // human-readable
  reads: string;               // e.g. "Notion Evidence"
  writes: string;              // e.g. "Supabase evidence"
  output_surface: string;      // where users see the effect (or "No consumer")
  visible_in_product: boolean; // false = output exists but no UI reads it
  priority: 1 | 2 | 3;         // 1 = critical, 2 = standard, 3 = low-volume
};

export const ROUTINE_CATALOG: Record<string, RoutineCatalogEntry> = {
  "sync-evidence": {
    schedule: "07:30 Mon-Fri",
    reads: "Notion Evidence",
    writes: "Supabase evidence",
    output_surface: "sync-loops (Supabase-first evidence path)",
    visible_in_product: true,
    priority: 1,
  },
  "sync-opportunities": {
    schedule: "09:00 Mon-Fri",
    reads: "Notion Opportunities",
    writes: "Supabase opportunities",
    output_surface: "/admin/opportunities, /admin/ops-mirror",
    visible_in_product: true,
    priority: 1,
  },
  "sync-loops": {
    schedule: "08:00 Mon-Fri",
    reads: "Supabase evidence + Notion Opportunities/Projects",
    writes: "Supabase loops, loop_signals, loop_actions",
    output_surface: "/admin ChiefOfStaffDesk via /api/cos-loops",
    visible_in_product: true,
    priority: 1,
  },
  "sync-projects": {
    schedule: "10:00 Mon-Fri",
    reads: "Notion Projects",
    writes: "Supabase projects",
    output_surface: "No UI reader yet (pre-provisioned)",
    visible_in_product: false,
    priority: 3,
  },
  "sync-sources": {
    schedule: "11:00 Mon-Fri",
    reads: "Notion Sources",
    writes: "Supabase sources",
    output_surface: "scan-opportunity-candidates (processed_summary)",
    visible_in_product: true,
    priority: 2,
  },
  "sync-organizations": {
    schedule: "12:00 Mon-Fri",
    reads: "Notion Organizations",
    writes: "Supabase organizations",
    output_surface: "No UI reader yet (pre-provisioned)",
    visible_in_product: false,
    priority: 3,
  },
  "sync-people": {
    schedule: "12:00 Mon-Fri",
    reads: "Notion People",
    writes: "Supabase people",
    output_surface: "/api/people-list, draft-checkin, delegate-to-desk",
    visible_in_product: true,
    priority: 1,
  },
  "ingest-gmail": {
    schedule: "07:00 Mon-Fri",
    reads: "Gmail API",
    writes: "Notion Sources",
    output_surface: "scan-opportunity-candidates, /admin/pipeline",
    visible_in_product: true,
    priority: 1,
  },
  "ingest-meetings": {
    schedule: "18:00 Mon-Fri + 00:00 Tue-Sat",
    reads: "Fireflies API",
    writes: "Notion Agent Drafts, People",
    output_surface: "/admin AgentQueueSection",
    visible_in_product: true,
    priority: 1,
  },
  "extract-meeting-evidence": {
    schedule: "02:00 Tue-Sat",
    reads: "Fireflies API",
    writes: "Notion Evidence (status=New)",
    output_surface: "/admin, /hall evidence queue",
    visible_in_product: true,
    priority: 2,
  },
  "evidence-to-knowledge": {
    schedule: "04:00 Mon-Fri",
    reads: "Notion Evidence (Canonical, 7d)",
    writes: "Notion Knowledge Assets (Draft)",
    output_surface: "/admin/knowledge, /library",
    visible_in_product: true,
    priority: 2,
  },
  "project-operator": {
    schedule: "05:00 Mon-Fri",
    reads: "Notion Projects + Evidence",
    writes: "Notion Projects (Status Summary, Draft Update)",
    output_surface: "/admin, /hall project cards",
    visible_in_product: true,
    priority: 1,
  },
  "validation-operator": {
    schedule: "03:00 Mon-Fri",
    reads: "Notion Evidence (Reviewed)",
    writes: "Notion + Supabase evidence.validation_status",
    output_surface: "/admin evidence queue",
    visible_in_product: true,
    priority: 1,
  },
  "relationship-warmth": {
    schedule: "06:00 Mon & Thu",
    reads: "Supabase People, Gmail",
    writes: "Notion + Supabase People (Contact Warmth, Last Contact)",
    output_surface: "/admin cold relationships",
    visible_in_product: true,
    priority: 1,
  },
  "generate-daily-briefing": {
    schedule: "07:30 Mon-Fri",
    reads: "Notion (5 DBs)",
    writes: "Notion Daily Briefings",
    output_surface: "/admin Focus-of-Day",
    visible_in_product: true,
    priority: 1,
  },
  "fireflies-sync": {
    schedule: "06:30 Mon-Fri",
    reads: "Fireflies API",
    writes: "Notion Projects/Sources/People timestamps",
    output_surface: "/admin, /hall",
    visible_in_product: true,
    priority: 2,
  },
  "grant-radar": {
    schedule: "07:00 Wed",
    reads: "Notion Projects + web search",
    writes: "Notion Opportunities (Type=Grant)",
    output_surface: "/admin/grants, /admin/opportunities",
    visible_in_product: true,
    priority: 2,
  },
};
