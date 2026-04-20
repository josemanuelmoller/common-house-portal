/**
 * /admin/routines — Routine health dashboard
 *
 * Joins the static ROUTINE_CATALOG (schedule, reads/writes, output surface,
 * visibility) with dynamic routine_runs telemetry (last run, duration,
 * success/failure, records read/written, error message). Read-only.
 *
 * Freshness heuristic: stale = no run in 1.5 × the routine's daily window
 * (compact rule — daily routines → 36h, bi-weekly → 14d). Routines that have
 * never run show as "never observed".
 */

import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ROUTINE_CATALOG, type RoutineCatalogEntry } from "@/lib/routine-log";

export const dynamic = "force-dynamic";

type LatestRun = {
  routine_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: "success" | "error";
  http_status: number | null;
  records_read: number | null;
  records_written: number | null;
  error_message: string | null;
};

type Row = {
  name: string;
  catalog: RoutineCatalogEntry;
  run: LatestRun | null;
  freshness: "fresh" | "stale" | "never";
  staleReason: string | null;
};

// Expected cadence in hours per routine; null = one-off / manual
function expectedCadenceHours(entry: RoutineCatalogEntry): number {
  const s = entry.schedule.toLowerCase();
  if (s.includes("mon & thu")) return 96;          // bi-weekly Mon/Thu
  if (s.includes("wed") && !s.includes("mon-fri")) return 7 * 24; // weekly Wed
  if (s.includes("tue-sat")) return 36;            // daily-ish
  if (s.includes("mon-fri")) return 36;            // daily weekday
  return 7 * 24;
}

function classifyFreshness(
  run: LatestRun | null,
  entry: RoutineCatalogEntry
): { freshness: Row["freshness"]; staleReason: string | null } {
  if (!run) return { freshness: "never", staleReason: "never observed" };
  const hoursSinceRun =
    (Date.now() - new Date(run.started_at).getTime()) / 3_600_000;
  const threshold = expectedCadenceHours(entry);
  if (hoursSinceRun > threshold) {
    return {
      freshness: "stale",
      staleReason: `${Math.floor(hoursSinceRun)}h since last run (expected ≤ ${threshold}h)`,
    };
  }
  return { freshness: "fresh", staleReason: null };
}

async function fetchLatestRuns(): Promise<Map<string, LatestRun>> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("routine_latest_runs")
      .select(
        "routine_name, started_at, finished_at, duration_ms, status, http_status, records_read, records_written, error_message"
      );
    if (error) {
      console.error("[admin/routines] fetch error:", error.message);
      return new Map();
    }
    return new Map((data ?? []).map((r) => [r.routine_name as string, r as LatestRun]));
  } catch (err) {
    console.error("[admin/routines] supabase unavailable:", err);
    return new Map();
  }
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function statusColor(status: "success" | "error" | "never"): string {
  if (status === "success") return "bg-[#B2FF59] text-[#131218]";
  if (status === "error")   return "bg-red-500 text-white";
  return "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]";
}

function freshnessBadge(f: Row["freshness"]): { label: string; cls: string } {
  if (f === "fresh") return { label: "fresh",  cls: "bg-green-50 text-green-700 border border-green-200" };
  if (f === "stale") return { label: "stale",  cls: "bg-amber-50 text-amber-700 border border-amber-200" };
  return             { label: "never",  cls: "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]" };
}

export default async function RoutinesPage() {
  await requireAdmin();
  const latestRuns = await fetchLatestRuns();

  const rows: Row[] = Object.entries(ROUTINE_CATALOG).map(([name, catalog]) => {
    const run = latestRuns.get(name) ?? null;
    const { freshness, staleReason } = classifyFreshness(run, catalog);
    return { name, catalog, run, freshness, staleReason };
  });

  // Sort: errors first, then stale, then fresh. Within each group, by priority.
  const order = { error: 0, stale: 1, never: 2, fresh: 3 } as const;
  rows.sort((a, b) => {
    const ka = a.run?.status === "error" ? 0 : order[a.freshness];
    const kb = b.run?.status === "error" ? 0 : order[b.freshness];
    if (ka !== kb) return ka - kb;
    return a.catalog.priority - b.catalog.priority;
  });

  const counts = {
    total: rows.length,
    fresh: rows.filter((r) => r.freshness === "fresh" && r.run?.status === "success").length,
    failing: rows.filter((r) => r.run?.status === "error").length,
    stale: rows.filter((r) => r.freshness === "stale").length,
    never: rows.filter((r) => r.freshness === "never").length,
  };

  return (
    <div className="flex min-h-screen bg-[#EFEFEA] text-[#131218]">
      <Sidebar adminNav />

      <main className="flex-1 p-8 overflow-x-auto">
        <header className="mb-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Routine Runs</h1>
            <p className="text-xs text-[#131218]/50">
              fetched {new Date().toLocaleString("en-GB")}
            </p>
          </div>
          <p className="text-sm text-[#131218]/60 mt-1">
            Health of scheduled / cron routines. Joined from{" "}
            <code className="text-[11px] bg-[#131218]/6 px-1 rounded">public.routine_runs</code>{" "}
            + static catalog in{" "}
            <code className="text-[11px] bg-[#131218]/6 px-1 rounded">src/lib/routine-log.ts</code>.
          </p>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 max-w-3xl">
          <StatPill label="Total"    value={counts.total}   />
          <StatPill label="Fresh"    value={counts.fresh}   tone="good" />
          <StatPill label="Failing"  value={counts.failing} tone={counts.failing > 0 ? "bad" : "neutral"} />
          <StatPill label="Stale"    value={counts.stale}   tone={counts.stale > 0 ? "warn" : "neutral"} />
          <StatPill label="No data"  value={counts.never}   tone={counts.never > 0 ? "warn" : "neutral"} />
        </section>

        <div className="bg-white border border-[#E0E0D8] rounded-[14px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#131218] text-white text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Routine</th>
                <th className="text-left px-4 py-3 font-semibold">Schedule</th>
                <th className="text-left px-4 py-3 font-semibold">Last run</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Dur</th>
                <th className="text-right px-4 py-3 font-semibold">R / W</th>
                <th className="text-left px-4 py-3 font-semibold">Fresh</th>
                <th className="text-left px-4 py-3 font-semibold">Output surface</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const runStatus: "success" | "error" | "never" =
                  !r.run ? "never" : r.run.status;
                const fresh = freshnessBadge(r.freshness);
                return (
                  <tr
                    key={r.name}
                    className="border-t border-[#E0E0D8] hover:bg-[#EFEFEA]/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-[11px] text-[#131218]/50 mt-0.5">
                        {r.catalog.reads} → {r.catalog.writes}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#131218]/70 text-xs">
                      {r.catalog.schedule}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.run ? (
                        <>
                          <div>{relTime(r.run.started_at)}</div>
                          <div className="text-[10px] text-[#131218]/40">
                            {new Date(r.run.started_at).toISOString().slice(0, 16).replace("T", " ")}
                          </div>
                        </>
                      ) : (
                        <span className="text-[#131218]/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(runStatus)}`}
                      >
                        {runStatus === "never" ? "no data" : runStatus}
                      </span>
                      {r.run?.error_message && (
                        <div className="text-[10px] text-red-600 mt-1 max-w-[260px] truncate" title={r.run.error_message}>
                          {r.run.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-[#131218]/70">
                      {formatDuration(r.run?.duration_ms ?? null)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-[#131218]/70">
                      {r.run?.records_read ?? "—"} / {r.run?.records_written ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${fresh.cls}`}>
                        {fresh.label}
                      </span>
                      {r.staleReason && (
                        <div className="text-[10px] text-[#131218]/50 mt-0.5">{r.staleReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className={r.catalog.visible_in_product ? "text-[#131218]/70" : "text-amber-600"}>
                        {r.catalog.output_surface}
                      </div>
                      {!r.catalog.visible_in_product && (
                        <div className="text-[10px] text-amber-600 mt-0.5">
                          no UI consumer
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-[#131218]/40 mt-4 max-w-3xl">
          A routine must be wrapped with <code>withRoutineLog()</code> in{" "}
          <code>src/lib/routine-log.ts</code> to show dynamic run data here.
          Routines declared in the catalog but not yet wrapped render as{" "}
          <em>no data</em>. Expected cadence is inferred from the schedule
          string; stale = no run within 1.5× the schedule window.
        </p>

        <div className="mt-6">
          <Link href="/admin" className="text-xs text-[#131218]/60 underline hover:text-[#131218]">
            ← back to admin
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatPill({
  label, value, tone = "neutral",
}: { label: string; value: number; tone?: "good" | "bad" | "warn" | "neutral" }) {
  const toneCls =
    tone === "good" ? "bg-[#B2FF59]/20 text-green-800 border-green-200" :
    tone === "bad"  ? "bg-red-50 text-red-700 border-red-200" :
    tone === "warn" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-white text-[#131218]/70 border-[#E0E0D8]";
  return (
    <div className={`rounded-[10px] border px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
