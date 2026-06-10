/**
 * pipeline-health.ts — "does the Hall's bloodstream actually flow?"
 *
 * The Hall renders intelligence derived from 6 ingestion sources + ~40 cron
 * routines, but until now NOTHING on the page surfaced whether they ran.
 * Real incident that motivated this: ingest-fireflies + ingest-loops silently
 * stopped on 2026-06-08 (duplicate cron paths dropped on redeploy) and
 * relationship-promotion-scan 502'd daily for a week — all invisible unless
 * someone happened to SQL into routine_runs.
 *
 * getPipelineHealth() reads the observability tables that already exist
 * (ingestor_runs, routine_runs) and reduces them to one verdict per source
 * plus a 24h error roll-up. Read-only, cheap (2 queries), never throws.
 */

import { getSupabaseServerClient } from "./supabase-server";

/** Expected cadence per ingestor source (hours between runs, from vercel.json).
 *  A source is `stalled` when its last successful run is older than 2× this. */
const EXPECTED_CADENCE_HOURS: Record<string, number> = {
  gmail:     6,   // 4×/day
  fireflies: 12,  // 2×/day
  calendar:  12,
  whatsapp:  12,
  loops:     12,
  drive:     24,
};

export type SourceHealth = {
  source: string;
  lastRunAt: string | null;
  hoursSince: number | null;
  status: "ok" | "stalled" | "never_ran";
};

export type PipelineHealth = {
  sources: SourceHealth[];
  stalled: SourceHealth[];
  errors24h: { count: number; routines: string[] };
  healthy: boolean;
};

export async function getPipelineHealth(): Promise<PipelineHealth> {
  const empty: PipelineHealth = {
    sources: [],
    stalled: [],
    errors24h: { count: 0, routines: [] },
    healthy: true,
  };
  try {
    const sb = getSupabaseServerClient();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();

    const [runsRes, errRes] = await Promise.all([
      sb.from("ingestor_runs")
        .select("source_type, started_at, status")
        .gte("started_at", since7d)
        .eq("status", "ok")
        .order("started_at", { ascending: false })
        .limit(400),
      sb.from("routine_runs")
        .select("routine_name")
        .eq("status", "error")
        .gte("started_at", since24h)
        .limit(200),
    ]);

    const lastOkBySource = new Map<string, string>();
    for (const r of (runsRes.data ?? []) as Array<{ source_type: string; started_at: string }>) {
      if (!lastOkBySource.has(r.source_type)) lastOkBySource.set(r.source_type, r.started_at);
    }

    const now = Date.now();
    const sources: SourceHealth[] = Object.entries(EXPECTED_CADENCE_HOURS).map(([source, cadence]) => {
      const last = lastOkBySource.get(source) ?? null;
      if (!last) return { source, lastRunAt: null, hoursSince: null, status: "never_ran" as const };
      const hoursSince = (now - new Date(last).getTime()) / 3_600_000;
      return {
        source,
        lastRunAt: last,
        hoursSince: Math.round(hoursSince * 10) / 10,
        status: hoursSince > cadence * 2 ? ("stalled" as const) : ("ok" as const),
      };
    });

    const errRoutines = [...new Set(
      ((errRes.data ?? []) as Array<{ routine_name: string }>).map(r => r.routine_name),
    )];
    const errCount = (errRes.data ?? []).length;

    const stalled = sources.filter(s => s.status !== "ok");
    return {
      sources,
      stalled,
      errors24h: { count: errCount, routines: errRoutines },
      healthy: stalled.length === 0 && errCount === 0,
    };
  } catch (e) {
    // The health strip must never take the page down — degrade to "unknown".
    console.error("[pipeline-health] read failed:", e instanceof Error ? e.message : e);
    return empty;
  }
}
