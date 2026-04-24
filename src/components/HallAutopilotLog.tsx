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
    <div>
      {/* K-v2 3-stat grid: runs / writes / errors */}
      <div
        className="grid grid-cols-3 gap-2.5 pb-3 mb-2.5"
        style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
      >
        <div>
          <span
            className="block leading-none font-bold"
            style={{ fontSize: 20, color: "var(--hall-ink-0)", letterSpacing: "-0.02em" }}
          >
            {totalRuns}
          </span>
          <span
            className="block mt-0.5 uppercase"
            style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}
          >
            runs
          </span>
        </div>
        <div>
          <span
            className="block leading-none font-bold"
            style={{ fontSize: 20, color: "var(--hall-ink-0)", letterSpacing: "-0.02em" }}
          >
            {totalWrites.toLocaleString()}
          </span>
          <span
            className="block mt-0.5 uppercase"
            style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}
          >
            writes
          </span>
        </div>
        <div>
          <span
            className="block leading-none font-bold"
            style={{
              fontSize: 20,
              color: totalErrors > 0 ? "var(--hall-danger)" : "var(--hall-ink-0)",
              letterSpacing: "-0.02em",
            }}
          >
            {totalErrors}
          </span>
          <span
            className="block mt-0.5 uppercase"
            style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}
          >
            errors 7d
          </span>
        </div>
      </div>

      {/* Agent rows */}
      <ul className="flex flex-col">
        {aggregates.slice(0, 5).map((a) => {
          const catalog = ROUTINE_CATALOG[a.routine];
          const status = a.errors > 0 ? "ERR" : a.runs === 0 ? "IDLE" : "OK";
          const statusColor = a.errors > 0 ? "var(--hall-danger)"
            : a.runs === 0 ? "var(--hall-muted-3)"
            : "var(--hall-ok)";
          return (
            <li
              key={a.routine}
              className="grid items-center py-2"
              style={{
                gridTemplateColumns: "1fr auto",
                gap: 10,
                borderTop: "1px solid var(--hall-line-soft)",
              }}
            >
              <div className="min-w-0">
                <span
                  className="block text-[12px] font-semibold truncate"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {a.routine}
                </span>
                {catalog && (
                  <span
                    className="block text-[10px] truncate"
                    style={{ color: "var(--hall-muted-2)" }}
                  >
                    {catalog.writes} → {catalog.output_surface}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] font-bold"
                style={{ fontFamily: "var(--font-hall-mono)", color: statusColor, letterSpacing: "0.08em" }}
              >
                {status}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="pt-3 flex justify-end">
        <Link
          href="/admin/routines"
          className="text-[10px] font-bold uppercase tracking-widest transition-colors"
          style={{ color: "var(--hall-muted-2)" }}
        >
          Full routine health ↗
        </Link>
      </div>
    </div>
  );
}
