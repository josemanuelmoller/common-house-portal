/**
 * HallAutopilotLog
 *
 * Collapsed "what the agents did this week without asking you" panel.
 * Reads a 7-day rollup from Supabase public.routine_runs (populated by
 * withRoutineLog). Each row = one cron/agent invocation. We aggregate
 * by routine_name: count of runs, total records_read / records_written,
 * and the most recent error if any.
 *
 * Server component — fetches on every render (cached by Next.js dynamic
 * rendering). Uses the static ROUTINE_CATALOG for the human-friendly
 * label + output surface link.
 */

import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ROUTINE_CATALOG } from "@/lib/routine-log";

type Aggregate = {
  routine: string;
  runs: number;
  reads: number;
  writes: number;
  errors: number;
  lastRun: string | null;
};

async function fetchWeekAggregate(): Promise<Aggregate[]> {
  try {
    const sb = getSupabaseServerClient();
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data, error } = await sb
      .from("routine_runs")
      .select("routine_name, started_at, status, records_read, records_written")
      .gte("started_at", since);
    if (error || !data) return [];

    const byName = new Map<string, Aggregate>();
    for (const row of data) {
      const key = row.routine_name as string;
      const agg = byName.get(key) ?? {
        routine: key,
        runs: 0,
        reads: 0,
        writes: 0,
        errors: 0,
        lastRun: null,
      };
      agg.runs += 1;
      agg.reads += (row.records_read as number | null) ?? 0;
      agg.writes += (row.records_written as number | null) ?? 0;
      if (row.status === "error") agg.errors += 1;
      const ts = row.started_at as string;
      if (!agg.lastRun || ts > agg.lastRun) agg.lastRun = ts;
      byName.set(key, agg);
    }
    // Sort by write volume — most "useful" routines first.
    return [...byName.values()].sort((a, b) => b.writes - a.writes);
  } catch {
    return [];
  }
}

export async function HallAutopilotLog() {
  const aggregates = await fetchWeekAggregate();

  // Summary numbers for the collapsed header.
  const totalRuns   = aggregates.reduce((n, a) => n + a.runs, 0);
  const totalWrites = aggregates.reduce((n, a) => n + a.writes, 0);
  const totalErrors = aggregates.reduce((n, a) => n + a.errors, 0);

  if (totalRuns === 0) return null;

  return (
    <details className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer list-none flex items-center gap-3 hover:bg-[#FAFAF7] transition-colors">
        <span className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#131218]/40">
          Autopilot
        </span>
        <span className="text-[11px] text-[#131218]/55">
          {totalRuns} run{totalRuns === 1 ? "" : "s"} · {totalWrites} record{totalWrites === 1 ? "" : "s"} written
          {totalErrors > 0 && (
            <span className="text-red-500 font-bold"> · {totalErrors} error{totalErrors === 1 ? "" : "s"}</span>
          )}
          <span className="text-[#131218]/30"> · last 7 days</span>
        </span>
        <span className="ml-auto text-[9px] text-[#131218]/25">expand ↓</span>
      </summary>

      <div className="px-5 py-3 border-t border-[#EFEFEA] divide-y divide-[#F3F3EE]">
        {aggregates.map((a) => {
          const catalog = ROUTINE_CATALOG[a.routine];
          return (
            <div key={a.routine} className="py-2 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#131218] truncate">
                  {a.routine}
                </p>
                {catalog && (
                  <p className="text-[9px] text-[#131218]/40 truncate">
                    {catalog.writes} → {catalog.output_surface}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-bold text-[#131218]">
                  {a.writes > 0 ? `+${a.writes}` : "·"}
                </p>
                <p className="text-[9px] text-[#131218]/40">
                  {a.runs}×{a.errors > 0 && (
                    <span className="text-red-500 font-bold"> · {a.errors} err</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        <div className="pt-3 flex justify-end">
          <Link
            href="/admin/routines"
            className="text-[10px] font-bold text-[#131218]/40 hover:text-[#131218] transition-colors"
          >
            Full routine health ↗
          </Link>
        </div>
      </div>
    </details>
  );
}
